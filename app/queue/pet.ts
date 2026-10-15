"use server";

import { businessOatcakes, feedPet, oatcakesEarned, type PetView } from "@/lib/pet";
import { requireEditor } from "@/lib/session";

// Give Pickle an oatcake from the tin, or five of them as a golden one. Returns how Pickle is now
// (unchanged when the tin hasn't enough). `business` feeds that business's shared Pickle.
export async function feedPickle(kind: "oatcake" | "golden", business?: string): Promise<PetView | null> {
  const { supabase, ctx, member } = await requireEditor(["designer", "manager", "client"]);
  if (business) {
    if (!member.business_ids?.includes(business)) return null;
    return feedPet(supabase, { business }, await businessOatcakes(supabase, business, ctx), kind);
  }
  return feedPet(supabase, undefined, await oatcakesEarned(supabase, member, ctx), kind);
}
