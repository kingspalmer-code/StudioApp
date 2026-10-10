import type { SupabaseClient } from "@supabase/supabase-js";

// Finished files the studio delivers on a job: stored in Oatcake, or a link to somewhere else.
export type Delivery = { id: number; ticket_id: number; path: string | null; url: string | null; name: string; size: number; mime: string; created_at: string };
export type SignedDelivery = Delivery & { view: string | null; download: string | null };

// The free storage plan takes files up to 50MB; bigger ones are shared as a link instead.
export const DELIVERY_MAX_MB = 50;

export const isImage = (d: Pick<Delivery, "mime" | "name">) => d.mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(d.name);
export const isVideo = (d: Pick<Delivery, "mime" | "name">) => d.mime.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(d.name);

export function fileSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

// Short-lived links to view each file, and to download it with its own name.
export async function signDeliveries(supabase: SupabaseClient, rows: Delivery[]): Promise<SignedDelivery[]> {
  const stored = rows.filter((d) => d.path);
  const bucket = supabase.storage.from("deliveries");
  const view: Record<string, string> = {};
  const download: Record<string, string> = {};
  if (stored.length) {
    const { data } = await bucket.createSignedUrls(stored.map((d) => d.path!), 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) view[s.path] = s.signedUrl;
    await Promise.all(
      stored.map(async (d) => {
        const { data: one } = await bucket.createSignedUrl(d.path!, 3600, { download: d.name });
        if (one?.signedUrl) download[d.path!] = one.signedUrl;
      })
    );
  }
  return rows.map((d) => ({ ...d, view: d.path ? view[d.path] ?? null : d.url, download: d.path ? download[d.path] ?? null : d.url }));
}

// For galleries: the first finished image on each job, and how many files it has.
export async function coversFor(supabase: SupabaseClient, ticketIds: number[]) {
  const covers: Record<number, { url: string | null; count: number }> = {};
  if (!ticketIds.length) return covers;
  const { data } = await supabase.from("ticket_deliveries").select("*").in("ticket_id", ticketIds).order("created_at").returns<Delivery[]>();
  const first: Record<number, Delivery> = {};
  for (const d of data ?? []) {
    covers[d.ticket_id] ??= { url: null, count: 0 };
    covers[d.ticket_id].count++;
    if (d.path && isImage(d) && !first[d.ticket_id]) first[d.ticket_id] = d;
  }
  const paths = Object.values(first).map((d) => d.path!);
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("deliveries").createSignedUrls(paths, 3600);
    const byPath = Object.fromEntries((signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path!, s.signedUrl]));
    for (const [id, d] of Object.entries(first)) covers[Number(id)].url = byPath[d.path!] ?? null;
  }
  return covers;
}
