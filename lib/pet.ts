import type { SupabaseClient } from "@supabase/supabase-js";
import { finalStage, todayISO, type Ctx } from "./priority";
import { dayOf, indexLogs, LOG_COLUMNS, type Habit, type HabitLog } from "./habits";
import { cashable, cleanBakery, CRUMBS_PER_OATCAKE, type Bakery } from "./pickle/bakery";
import { EARN, FREE, GAMES, GAME_CAP, ITEM, type GameId, type Slot, type Worn } from "./pickle/catalogue";
import type { Member } from "./types";

// Pickle, the pixel pet above the queue (components/QueueWidgets.tsx; table: pets, migration 027).
// Every delivered job puts an oatcake in the studio's tin; managers (on their Overview, migration
// 031) earn one for every request they send. A business that sends requests has one Pickle shared
// by all its logins (business_pets, migration 034), which earns an oatcake for every finished job. You feed them from the tin, or save five
// for a golden oatcake. Coming back each day keeps a streak going and earns two daily oatcakes (the
// database awards them, pet_visit in migration 053). Pickle never dies: hunger and
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
  bonus?: number; // daily oatcakes for each day's first visit (migration 053), plus any gifts
  // Pickle's World (migration 054). Rows from before it have no economy at all and keep the old
  // sums; economy 1 is waiting to be switched over (see upgradePet), economy 2 is the new one.
  economy?: number;
  spent?: number; // oatcakes spent in the shop
  owned?: string[]; // shop items bought (lib/pickle/catalogue.ts)
  worn?: Worn; // what he has on, one item per slot
  games_total?: number; // oatcakes won in the arcade, all time
  game_day?: string | null; // the London day game_paid counts
  game_paid?: number; // oatcakes won in the arcade that day
  bakery?: Bakery | Record<string, never>; // Pickle's Bakery, saved as it was left
};

// What fills the tin: how many things earned an oatcake (n, the old economy, one each) and what
// they're worth now (w, at EARN rates).
export type Earned = { n: number; w: number };
export const earnedFrom = (jobs: number, jobRate: number, more: { habits: number; todos: number } = { habits: 0, todos: 0 }): Earned => ({
  n: jobs + more.habits + more.todos,
  w: jobs * jobRate + more.habits * EARN.habit + more.todos * EARN.todo,
});

export type PetView = {
  tin: number;
  hunger: number; // 0–1, how full
  happy: number; // 0–1
  growth: number; // 0–1, toward the next level
  level: number;
  streak: number;
  glowing: boolean; // had a golden oatcake in the last day
  gift?: boolean; // this visit earned today's oatcakes
  mood: "idle" | "sad";
  full: boolean; // too full for another oatcake just now
  shop: boolean; // on the new economy, so the shop and arcade are open
  goldenCost: number;
  daily: number; // oatcakes for today's first visit
  owned: string[];
  worn: Worn;
  gamePaid: number; // won in the arcade today
  bakery: Bakery;
};

export const STARTER_OATCAKES = 3;
// The old economy: a golden oatcake was five, and each day's first visit two (migration 053).
const OLD_GOLDEN = 5, OLD_DAILY = 2;
// The new one: oatcakes are worth less each, so everything is worth more of them. Tins carry over
// at SWITCH_RATE times what was in them. Pickle won't eat once he's FULL_AT fed.
export const GOLDEN_COST = 25;
const SWITCH_RATE = 5;
const FULL_AT = 0.9;
export const XP_PER_LEVEL = 10;
const DAY = 86_400_000;
const isNew = (row: PetRow) => (row.economy ?? 0) >= 2;
const goldenCost = (row: PetRow) => (isNew(row) ? GOLDEN_COST : OLD_GOLDEN);

function tinOf(row: PetRow, earned: Earned) {
  if (!isNew(row)) return earned.n + (row.bonus ?? 0) - row.earned_base - row.fed - row.golden * OLD_GOLDEN;
  return earned.w + (row.bonus ?? 0) + (row.games_total ?? 0) - row.earned_base - row.fed - row.golden * GOLDEN_COST - (row.spent ?? 0);
}

// London day, as pet_visit counts them.
export const londonDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export function petView(row: PetRow, earned: Earned, now = Date.now()): PetView {
  const tin = Math.max(0, tinOf(row, earned));
  const glowing = !!row.last_golden_at && now - Date.parse(row.last_golden_at) < DAY;
  // Full when fed, empties over three days, never below a sliver.
  const sinceFed = row.last_fed_at ? (now - Date.parse(row.last_fed_at)) / DAY : 3;
  const hunger = glowing ? 1 : Math.max(0.1, 1 - sinceFed / 3);
  // Coming back day after day lifts the mood; being hungry drags it down.
  const happy = glowing ? 1 : Math.max(0.15, Math.min(1, 0.4 + 0.15 * Math.min(row.streak, 4)) * (hunger < 0.3 ? 0.6 : 1));
  const xp = row.fed + row.golden * 10;
  return {
    tin,
    hunger,
    happy,
    growth: (xp % XP_PER_LEVEL) / XP_PER_LEVEL,
    level: 1 + Math.floor(xp / XP_PER_LEVEL),
    streak: row.streak,
    glowing,
    mood: hunger < 0.3 || happy < 0.4 ? "sad" : "idle",
    full: isNew(row) && !glowing && hunger >= FULL_AT,
    shop: isNew(row),
    goldenCost: goldenCost(row),
    daily: isNew(row) ? EARN.daily : OLD_DAILY,
    owned: [...new Set([...FREE, ...(row.owned ?? [])])],
    worn: row.worn ?? {},
    gamePaid: row.game_day === londonDay() ? row.game_paid ?? 0 : 0,
    bakery: cleanBakery(row.bakery, londonDay()),
  };
}

// What fills this person's tin: jobs delivered for the studio, requests sent for everyone else,
// plus their own habits and to-dos (bonusOatcakes).
export async function oatcakesEarned(supabase: SupabaseClient, member: Member, ctx: Ctx): Promise<Earned> {
  const q = supabase.from("tickets").select("id", { count: "exact", head: true });
  const studio = member.role === "designer";
  const [{ count }, bonus] = await Promise.all([
    studio ? q.eq("status", finalStage(ctx)) : q.eq("created_by", member.email),
    bonusOatcakes(supabase, member.email),
  ]);
  return earnedFrom(count ?? 0, studio ? EARN.job : EARN.request, bonus);
}

// Habits and to-dos started earning from this day, so older to-dos don't tip a heap into the tin at once.
const BONUS_FROM = "2026-10-26";

// An oatcake for each day a habit was done (its goal met), and for each to-do ticked off on the
// To-do page (the to-do itself, not its steps). Your own only; a business's shared Pickle doesn't get these.
export async function bonusOatcakes(supabase: SupabaseClient, email: string): Promise<{ habits: number; todos: number }> {
  const [{ data: habits }, { data: logs }, { count: todos }] = await Promise.all([
    supabase.from("habits").select("id, kind, per_day").eq("gone", false).returns<Pick<Habit, "id" | "kind" | "per_day">[]>(),
    supabase.from("habit_logs").select(LOG_COLUMNS).eq("gone", false).eq("status", "done").gte("on_date", BONUS_FROM).limit(20000).returns<HabitLog[]>(),
    supabase.from("plan_items").select("id", { count: "exact", head: true }).eq("owner", email).is("parent_id", null).eq("gone", false).gte("done_at", BONUS_FROM),
  ]);
  const byHabit = indexLogs(logs ?? []);
  let days = 0;
  for (const h of habits ?? []) for (const day of byHabit.get(h.id)?.values() ?? []) if (dayOf(h as Habit, day).done) days++;
  return { habits: days, todos: todos ?? 0 };
}

// Clients and managers start with every request they've already sent in the tin (at least the
// starter few); the studio starts with just the starter few.
export function hatchBase(member: Member, earned: Earned) {
  return member.role === "designer" ? earned.n - STARTER_OATCAKES : Math.min(0, earned.n - STARTER_OATCAKES);
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
export async function businessOatcakes(supabase: SupabaseClient, business: string, ctx: Ctx): Promise<Earned> {
  const { count } = await supabase.from("tickets").select("id", { count: "exact", head: true }).eq("business_id", business).eq("status", finalStage(ctx));
  return earnedFrom(count ?? 0, EARN.job);
}

// Moves a Pickle onto the new economy (economy 1 → 2) the first time it's loaded after migration
// 054: whatever was in the tin is multiplied by SWITCH_RATE, and earned_base soaks up everything
// earned and eaten before, so only what happens from now on counts at the new rates.
async function upgradePet(supabase: SupabaseClient, owner: PetOwner, row: PetRow, earned: Earned): Promise<PetRow> {
  if (row.economy !== 1) return row;
  const tin = Math.max(0, tinOf(row, earned));
  const next = { ...row, economy: 2 };
  const change = { economy: 2, earned_base: tinOf({ ...next, earned_base: 0 }, earned) - tin * SWITCH_RATE };
  const q = (owner ? supabase.from("business_pets").update(change).eq("business_id", owner.business) : supabase.from("pets").update(change).eq("owner_email", row.owner_email!)).eq("economy", 1);
  const { data } = await q.select("*").maybeSingle<PetRow>();
  // Someone else's page switched it first: use theirs.
  if (!data) return (await loadPet(supabase, owner)).data ?? row;
  return data;
}

async function loadReady(supabase: SupabaseClient, owner: PetOwner, earned: Earned) {
  const { data: row } = await loadPet(supabase, owner);
  return row ? upgradePet(supabase, owner, row, earned) : null;
}

// Give Pickle an oatcake from the tin, or a golden one, given how many have been earned. On the
// new economy he won't eat when he's full (golden ones are a treat, so they're always fine).
export async function feedPet(supabase: SupabaseClient, owner: PetOwner, earned: Earned, kind: "oatcake" | "golden"): Promise<PetView | null> {
  const row = await loadReady(supabase, owner, earned);
  if (!row) return null;
  const view = petView(row, earned);
  const cost = kind === "golden" ? view.goldenCost : 1;
  if (view.tin < cost || (kind === "oatcake" && view.full)) return view;
  const now = new Date().toISOString();
  const change = kind === "golden" ? { golden: row.golden + 1, last_golden_at: now, last_fed_at: now } : { fed: row.fed + 1, last_fed_at: now };
  await savePet(supabase, owner, row, change);
  return petView({ ...row, ...change }, earned);
}

// Buy something from the shop and put it on. Prices come from the catalogue, never the browser.
export async function buyItem(supabase: SupabaseClient, earned: Earned, id: string): Promise<PetView | null> {
  const item = ITEM[id];
  const row = await loadReady(supabase, undefined, earned);
  if (!row || !item || !isNew(row)) return row ? petView(row, earned) : null;
  const view = petView(row, earned);
  if (view.owned.includes(id) || view.tin < item.price || (item.needs && !view.owned.includes(item.needs))) return view;
  const change = { spent: (row.spent ?? 0) + item.price, owned: [...(row.owned ?? []), id], worn: { ...(row.worn ?? {}), [item.slot]: id } };
  await savePet(supabase, undefined, row, change);
  return petView({ ...row, ...change }, earned);
}

// Put on something you own (or take off whatever's in that slot, with id null).
export async function wearItem(supabase: SupabaseClient, earned: Earned, slot: Slot, id: string | null): Promise<PetView | null> {
  const row = await loadReady(supabase, undefined, earned);
  if (!row || !isNew(row)) return row ? petView(row, earned) : null;
  const view = petView(row, earned);
  if (id && (ITEM[id]?.slot !== slot || !view.owned.includes(id))) return view;
  const worn = { ...(row.worn ?? {}) };
  if (id) worn[slot] = id;
  else delete worn[slot];
  await savePet(supabase, undefined, row, { worn });
  return petView({ ...row, worn }, earned);
}

// Oatcakes from a game: one per GAMES[game].per points, up to the day's cap across all games.
export async function payGame(supabase: SupabaseClient, earned: Earned, game: GameId, score: number): Promise<{ won: number; pet: PetView } | null> {
  const row = await loadReady(supabase, undefined, earned);
  if (!row || !isNew(row) || !GAMES[game]) return null;
  const today = londonDay();
  const paid = row.game_day === today ? row.game_paid ?? 0 : 0;
  const won = Math.max(0, Math.min(Math.floor(Math.max(0, score) / GAMES[game].per), GAMES[game].cap, GAME_CAP - paid));
  if (!won) return { won, pet: petView(row, earned) };
  const change = { games_total: (row.games_total ?? 0) + won, game_day: today, game_paid: paid + won };
  await savePet(supabase, undefined, row, change);
  return { won, pet: petView({ ...row, ...change }, earned) };
}

// Keep the bakery as it was left in the browser (tidied up by cleanBakery). With `cash`, also
// turn crumbs into oatcakes, as many as today's cap allows; they count with the arcade's winnings.
export async function saveBakery(supabase: SupabaseClient, earned: Earned, raw: unknown, cash = false): Promise<{ won: number; pet: PetView } | null> {
  const row = await loadReady(supabase, undefined, earned);
  if (!row || !isNew(row)) return null;
  const bakery = cleanBakery(raw, londonDay());
  const won = cash ? cashable(bakery) : 0;
  if (won) {
    bakery.crumbs -= won * CRUMBS_PER_OATCAKE;
    bakery.cashed += won;
  }
  const change = { bakery, ...(won ? { games_total: (row.games_total ?? 0) + won } : {}) };
  await savePet(supabase, undefined, row, change);
  return { won, pet: petView({ ...row, ...change }, earned) };
}

// Called when Today or the queue loads: counts today's visit toward the streak (the first visit
// each day also earns two oatcakes, awarded by the database), or hatches Pickle the first time with
// a few oatcakes to start.
export async function visitPet(supabase: SupabaseClient, earned: Earned, base = earned.n - STARTER_OATCAKES, owner?: PetOwner): Promise<PetView | null> {
  const { data: row } = await supabase.rpc("pet_visit", { p_business: owner?.business ?? null });
  if (row) return { ...petView(await upgradePet(supabase, owner, row as PetRow, earned), earned), gift: !!(row as { gift?: boolean }).gift };
  const fresh = { ...(owner ? { business_id: owner.business } : {}), earned_base: base, last_visit: todayISO(), streak: 1, best_streak: 1, last_fed_at: new Date().toISOString() };
  const { data } = await supabase.from(petTable(owner)).insert(fresh).select("*").single<PetRow>();
  return data ? petView(await upgradePet(supabase, owner, data, earned), earned) : null;
}
