import type { SupabaseClient } from "@supabase/supabase-js";

// Links to stored files are signed for an hour. Signing again on every page view gave the same
// picture a new address each time, so browsers downloaded every thumbnail afresh and each page
// waited on the storage service. Instead a link is kept and handed out again while it still has
// at least 20 minutes left, so the address stays the same and the browser's copy gets used.
// Links are kept per person (and per server instance), so nobody is handed a link they couldn't
// have signed themselves.
const TTL = 3600;
const REUSE_MS = 20 * 60 * 1000;
const kept = new Map<string, { url: string; until: number }>();

async function who(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? "";
}

function keep(key: string, url: string) {
  // Old links are swept out now and then so the list can't grow without end.
  if (kept.size > 5000) {
    const now = Date.now();
    for (const [k, v] of kept) if (v.until - now < REUSE_MS) kept.delete(k);
    if (kept.size > 5000) kept.clear();
  }
  kept.set(key, { url, until: Date.now() + TTL * 1000 });
}

function fresh(key: string) {
  const hit = kept.get(key);
  return hit && hit.until - Date.now() > REUSE_MS ? hit.url : null;
}

// Viewing links for many files in one bucket, by path. Paths it couldn't sign are left out.
export async function signedUrls(supabase: SupabaseClient, bucket: string, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!paths.length) return out;
  const user = await who(supabase);
  const key = (p: string) => `${user}|${bucket}|${p}`;
  const missing = [...new Set(paths)].filter((p) => {
    const url = fresh(key(p));
    if (url) out[p] = url;
    return !url;
  });
  if (missing.length) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(missing, TTL);
    for (const s of data ?? []) {
      if (!s.path || !s.signedUrl) continue;
      out[s.path] = s.signedUrl;
      if (user) keep(key(s.path), s.signedUrl);
    }
  }
  return out;
}

// A link that downloads one file under the given name.
export async function downloadUrl(supabase: SupabaseClient, bucket: string, path: string, name: string): Promise<string | null> {
  const user = await who(supabase);
  const key = `${user}|${bucket}|${path}|dl:${name}`;
  const hit = fresh(key);
  if (hit) return hit;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, TTL, { download: name });
  if (data?.signedUrl && user) keep(key, data.signedUrl);
  return data?.signedUrl ?? null;
}
