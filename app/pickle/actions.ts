"use server";

import { buyItem, oatcakesEarned, payGame, saveBakery, wearItem, type PetView } from "@/lib/pet";
import type { GameId, Slot } from "@/lib/pickle/catalogue";
import { requireEditor } from "@/lib/session";

// Pickle's World (page.tsx). Each works on your own Pickle and returns how he is now; the
// catalogue sets the prices and the game caps, so nothing the browser sends can change them.
async function mine() {
  const { supabase, member, ctx } = await requireEditor();
  return { supabase, earned: await oatcakesEarned(supabase, member, ctx) };
}

export async function buyPickleItem(id: string): Promise<PetView | null> {
  const { supabase, earned } = await mine();
  return buyItem(supabase, earned, id);
}

export async function wearPickleItem(slot: Slot, id: string | null): Promise<PetView | null> {
  const { supabase, earned } = await mine();
  return wearItem(supabase, earned, slot, id);
}

export async function payPickleGame(game: GameId, score: number) {
  const { supabase, earned } = await mine();
  return payGame(supabase, earned, game, score);
}

// Pickle's Bakery: save how it was left, and with `cash` turn crumbs into oatcakes.
export async function savePickleBakery(bakery: unknown, cash = false) {
  const { supabase, earned } = await mine();
  return saveBakery(supabase, earned, bakery, cash);
}
