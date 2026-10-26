import type { SupabaseClient } from "@supabase/supabase-js";
import { finalStage, todayISO, type Ctx } from "./priority";
import { dayOf, indexLogs, LOG_COLUMNS, type Habit, type HabitLog } from "./habits";
import type { Member } from "./types";

// Pickle, the pixel pet above the queue (components/QueueWidgets.tsx; table: pets, migration 027).
// Every delivered job puts an oatcake in the studio's tin; managers (on their Overview, migration
// 031) earn one for every request they send. A business that sends requests has one Pickle shared
// by all its logins (business_pets, migration 034), which earns an oatcake for every finished job. You feed them from the tin, or save five
// for a golden oatcake. Coming back each day keeps a streak going. Pickle never dies: hunger and
// mood bottom out at "peckish" and "glum", and one oatcake perks them up.
export type PetRow = {
  owner_email?: string;
  business_id?: string;
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

// What fills this person's tin: jobs delivered for the studio, requests sent for everyone else,
// plus their own habits and to-dos (bonusOatcakes).
export async function oatcakesEarned(supabase: SupabaseClient, member: Member, ctx: Ctx): Promise<number> {
  const q = supabase.from("tickets").select("id", { count: "exact", head: true });
  const [{ count }, bonus] = await Promise.all([
    member.role === "designer" ? q.eq("status", finalStage(ctx)) : q.eq("created_by", member.email),
    bonusOatcakes(supabase, member.email),
  ]);
  return (count ?? 0) + bonus;
}

// Habits and to-dos started earning from this day, so older to-dos don't tip a heap into the tin at once.
const BONUS_FROM = "2026-10-26";

// An oatcake for each day a habit was done (its goal met), and for each to-do ticked off on the
// To-do page (the to-do itself, not its steps). Your own only; a business's shared Pickle doesn't get these.
export async function bonusOatcakes(supabase: SupabaseClient, email: string): Promise<number> {
  const [{ data: habits }, { data: logs }, { count: todos }] = await Promise.all([
    supabase.from("habits").select("id, kind, per_day").eq("gone", false).returns<Pick<Habit, "id" | "kind" | "per_day">[]>(),
    supabase.from("habit_logs").select(LOG_COLUMNS).eq("gone", false).eq("status", "done").gte("on_date", BONUS_FROM).limit(20000).returns<HabitLog[]>(),
    supabase.from("plan_items").select("id", { count: "exact", head: true }).eq("owner", email).is("parent_id", null).eq("gone", false).gte("done_at", BONUS_FROM),
  ]);
  const byHabit = indexLogs(logs ?? []);
  let days = 0;
  for (const h of habits ?? []) for (const day of byHabit.get(h.id)?.values() ?? []) if (dayOf(h as Habit, day).done) days++;
  return days + (todos ?? 0);
}

// Clients and managers start with every request they've already sent in the tin (at least the
// starter few); the studio starts with just the starter few.
export function hatchBase(member: Member, earned: number) {
  return member.role === "designer" ? earned - STARTER_OATCAKES : Math.min(0, earned - STARTER_OATCAKES);
}

// Whose Pickle: your own, or a business's (shared by everyone who requests for it).
export type PetOwner = { business: string } | undefined;
const petTable = (owner: PetOwner) => (owner ? "business_pets" : "pets");
const loadPet = (supabase: SupabaseClient, owner: PetOwner) => {
  const q = supabase.from(petTable(owner)).select("*");
  return (owner ? q.eq("business_id", owner.business) : q).maybeSingle<PetRow>();
};
const savePet = (supabase: SupabaseClient, owner: PetOwner, row: PetRow, change: Partial<PetRow>) =>
  owner ? supabase.from("business_pets").update(change).eq("business_id", owner.business) : supabase.from("pets").update(change).eq("owner_email", row.owner_email!);

// A business earns an oatcake for every one of its jobs that's finished; its Pickle starts with
// all the ones already finished (at least the starter few).
export async function businessOatcakes(supabase: SupabaseClient, business: string, ctx: Ctx): Promise<number> {
  const { count } = await supabase.from("tickets").select("id", { count: "exact", head: true }).eq("business_id", business).eq("status", finalStage(ctx));
  return count ?? 0;
}

// Give Pickle an oatcake from the tin, or five as a golden one, given how many have been earned.
export async function feedPet(supabase: SupabaseClient, owner: PetOwner, earned: number, kind: "oatcake" | "golden"): Promise<PetView | null> {
  const { data: row } = await loadPet(supabase, owner);
  if (!row) return null;
  const cost = kind === "golden" ? GOLDEN_COST : 1;
  if (petView(row, earned).tin < cost) return petView(row, earned);
  const now = new Date().toISOString();
  const change = kind === "golden" ? { golden: row.golden + 1, last_golden_at: now, last_fed_at: now } : { fed: row.fed + 1, last_fed_at: now };
  await savePet(supabase, owner, row, change);
  return petView({ ...row, ...change }, earned);
}

// Called when the queue page loads: hatches Pickle the first time (with a few oatcakes to start)
// and counts today's visit toward the streak.
export async function visitPet(supabase: SupabaseClient, delivered: number, base = delivered - STARTER_OATCAKES, owner?: PetOwner): Promise<PetView | null> {
  const today = todayISO();
  const { data: row } = await loadPet(supabase, owner);
  if (!row) {
    const fresh = { ...(owner ? { business_id: owner.business } : {}), earned_base: base, last_visit: today, streak: 1, best_streak: 1, last_fed_at: new Date().toISOString() };
    const { data } = await supabase.from(petTable(owner)).insert(fresh).select("*").single<PetRow>();
    return data ? petView(data, delivered) : null;
  }
  if (row.last_visit === today) return petView(row, delivered);
  const yesterday = new Date(Date.parse(today) - DAY).toISOString().slice(0, 10);
  const streak = row.last_visit === yesterday ? row.streak + 1 : 1;
  const next = { ...row, last_visit: today, streak, best_streak: Math.max(row.best_streak, streak) };
  await savePet(supabase, owner, row, { last_visit: today, streak, best_streak: next.best_streak });
  return petView(next, delivered);
}
