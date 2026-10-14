import type { SupabaseClient } from "@supabase/supabase-js";
import { finalStage, todayISO, type Ctx } from "./priority";
import type { Member } from "./types";

// Pickle, the pixel pet above the queue (components/QueueWidgets.tsx; table: pets, migration 027).
// Every delivered job puts an oatcake in the studio's tin; for clients and managers (on their
// Overview, migration 031) it's every request they send. You feed them from the tin, or save five
// for a golden oatcake. Coming back each day keeps a streak going. Pickle never dies: hunger and
// mood bottom out at "peckish" and "glum", and one oatcake perks them up.
export type PetRow = {
  owner_email: string;
  earned_base: number;
  fed: number;
  golden: number;
  last_fed_at: string | null;
  last_golden_at: string | null;
  last_visit: string | null;
  streak: number;
  best_streak: number;
};

export type PetView = {
  tin: number;
  hunger: number; // 0–1, how full
  happy: number; // 0–1
  growth: number; // 0–1, toward the next level
  level: number;
  streak: number;
  glowing: boolean; // had a golden oatcake in the last day
  mood: "idle" | "sad";
};

export const STARTER_OATCAKES = 3;
export const GOLDEN_COST = 5;
const XP_PER_LEVEL = 10;
const DAY = 86_400_000;

export function petView(row: PetRow, delivered: number, now = Date.now()): PetView {
  const tin = Math.max(0, delivered - row.earned_base - row.fed - row.golden * GOLDEN_COST);
  const glowing = !!row.last_golden_at && now - Date.parse(row.last_golden_at) < DAY;
  // Full when fed, empties over three days, never below a sliver.
  const sinceFed = row.last_fed_at ? (now - Date.parse(row.last_fed_at)) / DAY : 3;
  const hunger = glowing ? 1 : Math.max(0.1, 1 - sinceFed / 3);
  // Coming back day after day lifts the mood; being hungry drags it down.
  const happy = glowing ? 1 : Math.max(0.15, Math.min(1, 0.4 + 0.15 * Math.min(row.streak, 4)) * (hunger < 0.3 ? 0.6 : 1));
  const xp = row.fed + row.golden * GOLDEN_COST * 2;
  return {
    tin,
    hunger,
    happy,
    growth: (xp % XP_PER_LEVEL) / XP_PER_LEVEL,
    level: 1 + Math.floor(xp / XP_PER_LEVEL),
    streak: row.streak,
    glowing,
    mood: hunger < 0.3 || happy < 0.4 ? "sad" : "idle",
  };
}

// What fills this person's tin: jobs delivered for the studio, requests sent for everyone else.
export async function oatcakesEarned(supabase: SupabaseClient, member: Member, ctx: Ctx): Promise<number> {
  const q = supabase.from("tickets").select("id", { count: "exact", head: true });
  const { count } = await (member.role === "designer" ? q.eq("status", finalStage(ctx)) : q.eq("created_by", member.email));
  return count ?? 0;
}

// Clients and managers start with every request they've already sent in the tin (at least the
// starter few); the studio starts with just the starter few.
export function hatchBase(member: Member, earned: number) {
  return member.role === "designer" ? earned - STARTER_OATCAKES : Math.min(0, earned - STARTER_OATCAKES);
}

// Called when the queue page loads: hatches Pickle the first time (with a few oatcakes to start)
// and counts today's visit toward the streak.
export async function visitPet(supabase: SupabaseClient, delivered: number, base = delivered - STARTER_OATCAKES): Promise<PetView | null> {
  const today = todayISO();
  const { data: row } = await supabase.from("pets").select("*").maybeSingle<PetRow>();
  if (!row) {
    const fresh = { earned_base: base, last_visit: today, streak: 1, best_streak: 1, last_fed_at: new Date().toISOString() };
    const { data } = await supabase.from("pets").insert(fresh).select("*").single<PetRow>();
    return data ? petView(data, delivered) : null;
  }
  if (row.last_visit === today) return petView(row, delivered);
  const yesterday = new Date(Date.parse(today) - DAY).toISOString().slice(0, 10);
  const streak = row.last_visit === yesterday ? row.streak + 1 : 1;
  const next = { ...row, last_visit: today, streak, best_streak: Math.max(row.best_streak, streak) };
  await supabase.from("pets").update({ last_visit: today, streak, best_streak: next.best_streak }).eq("owner_email", row.owner_email);
  return petView(next, delivered);
}
