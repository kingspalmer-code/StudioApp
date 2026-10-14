"use server";

import { GOLDEN_COST, oatcakesEarned, petView, type PetRow, type PetView } from "@/lib/pet";
import { requireEditor } from "@/lib/session";

// Give Pickle an oatcake from the tin, or five of them as a golden one. Returns how Pickle is now
// (unchanged when the tin hasn't enough).
export async function feedPickle(kind: "oatcake" | "golden"): Promise<PetView | null> {
  const { supabase, ctx, member } = await requireEditor(["designer", "manager", "client"]);
  const [{ data: row }, delivered] = await Promise.all([
    supabase.from("pets").select("*").maybeSingle<PetRow>(),
    oatcakesEarned(supabase, member, ctx),
  ]);
  if (!row) return null;
  const cost = kind === "golden" ? GOLDEN_COST : 1;
  if (petView(row, delivered).tin < cost) return petView(row, delivered);
  const now = new Date().toISOString();
  const change = kind === "golden" ? { golden: row.golden + 1, last_golden_at: now, last_fed_at: now } : { fed: row.fed + 1, last_fed_at: now };
  await supabase.from("pets").update(change).eq("owner_email", row.owner_email);
  return petView({ ...row, ...change }, delivered);
}
