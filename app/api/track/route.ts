import { createClient } from "@/lib/supabase/server";

// Saves usage events from the browser (see lib/track.ts). Each row is tied to the signed-in
// person by the database, and only Oatcake admins can read them back.
const KINDS = new Set(["view", "time", "action", "error"]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.no_tracking) return new Response(null, { status: 204 });
  const body = (await req.json().catch(() => null)) as { events?: unknown[] } | null;
  const rows = (Array.isArray(body?.events) ? body.events : [])
    .slice(0, 40)
    .map((e) => e as { kind?: string; name?: string; path?: string; ms?: number; meta?: unknown })
    .filter((e) => typeof e.kind === "string" && KINDS.has(e.kind) && typeof e.path === "string")
    .map((e) => {
      const meta = e.meta && typeof e.meta === "object" ? JSON.stringify(e.meta) : "{}";
      return {
        user_id: user.id,
        kind: e.kind!,
        name: String(e.name ?? "").slice(0, 60),
        path: e.path!.slice(0, 200),
        ms: Math.max(0, Math.min(600_000, Math.round(Number(e.ms) || 0))),
        meta: meta.length <= 1500 ? JSON.parse(meta) : {},
      };
    });
  if (rows.length) {
    const { error } = await supabase.from("activity").insert(rows);
    if (error) console.error("track", error.message);
  }
  return new Response(null, { status: 204 });
}
