"use server";

import { requireEditor } from "@/lib/session";
import { todayIn } from "@/lib/plan";
import { HABIT_COLOURS, HABIT_COLUMNS, HABIT_ICONS, LOG_COLUMNS, goalOf, type Goal, type Habit, type HabitLog } from "@/lib/habits";

// Every change on the Habits page shows on screen straight away; these save it and hand back the
// saved row (or an error) so the page can put things back if it didn't go through.
type Result<T> = { row?: T; error?: string };

const clean = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);
const num = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const dateOk = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export type HabitInput = Partial<Omit<Habit, "id" | "created_at">>;

// Only the fields we know, each kept within what the database allows.
function tidy(input: HabitInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("name" in input) row.name = clean(input.name, 80);
  if (input.kind && ["session", "count", "money"].includes(input.kind)) row.kind = input.kind;
  if (input.icon && input.icon in HABIT_ICONS) row.icon = input.icon;
  if (input.colour && (HABIT_COLOURS.includes(input.colour) || /^#[0-9a-f]{6}$/i.test(input.colour))) row.colour = input.colour;
  if ("unit" in input) row.unit = clean(input.unit, 20);
  if ("per_day" in input) row.per_day = num(input.per_day, 0.01, 100000, 1);
  if ("labels" in input) row.labels = (input.labels ?? []).map((l) => clean(l, 30)).filter(Boolean).slice(0, 12);
  if (input.freq && ["daily", "days", "times"].includes(input.freq)) row.freq = input.freq;
  if ("days" in input) row.days = [...new Set((input.days ?? []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  if ("times_per" in input) row.times_per = Math.round(num(input.times_per, 1, 21, 1));
  if ("period_weeks" in input) row.period_weeks = Math.round(num(input.period_weeks, 1, 8, 1));
  if (input.part && ["morning", "afternoon", "evening", "any"].includes(input.part)) row.part = input.part;
  if ("remind_at" in input) row.remind_at = typeof input.remind_at === "string" && /^\d{2}:\d{2}/.test(input.remind_at) ? input.remind_at.slice(0, 5) : null;
  if ("rank" in input && Number.isFinite(input.rank)) row.rank = input.rank;
  return row;
}

export async function addHabit(input: HabitInput): Promise<Result<Habit>> {
  const { supabase } = await requireEditor();
  const row = tidy(input);
  if (!row.name) return { error: "Give it a name." };
  const { data, error } = await supabase.from("habits").insert(row).select(HABIT_COLUMNS).single<Habit>();
  return error ? { error: error.message } : { row: data };
}

export async function updateHabit(id: number, input: HabitInput): Promise<Result<Habit>> {
  const { supabase } = await requireEditor();
  const row = tidy(input);
  if ("name" in row && !row.name) return { error: "Give it a name." };
  // Moving the nudge lets it go out again today.
  if ("remind_at" in row) row.nudged_on = null;
  const { data, error } = await supabase.from("habits").update(row).eq("id", id).select(HABIT_COLUMNS).single<Habit>();
  return error ? { error: error.message } : { row: data };
}

export async function removeHabit(id: number): Promise<{ error?: string }> {
  const { supabase } = await requireEditor();
  const { error } = await supabase.from("habits").update({ gone: true }).eq("id", id);
  return error ? { error: error.message } : {};
}

// The "kinder goal?" card. Yes takes the new goal (keeping the old one to offer back later, or
// clearing it when stepping back up); either answer stops it asking again for a fortnight.
export async function answerEase(id: number, take: Goal | null, kind: "ease" | "up"): Promise<Result<Habit>> {
  const { supabase } = await requireEditor();
  const { data: was } = await supabase.from("habits").select(HABIT_COLUMNS).eq("id", id).single<Habit>();
  if (!was) return { error: "That habit has gone." };
  const row: Record<string, unknown> = { ease_asked_on: todayIn() };
  if (take) {
    Object.assign(row, tidy(take));
    row.eased_from = kind === "ease" ? (was.eased_from ?? goalOf(was)) : null;
  }
  const { data, error } = await supabase.from("habits").update(row).eq("id", id).select(HABIT_COLUMNS).single<Habit>();
  return error ? { error: error.message } : { row: data };
}

// Sliding right (done) or left (skip). A day can be logged up to a fortnight back.
export async function logHabit(input: { habit_id: number; on_date: string; status: "done" | "skip"; amount?: number | null; feel?: HabitLog["feel"]; note?: string }): Promise<Result<HabitLog>> {
  const { supabase } = await requireEditor();
  const today = todayIn();
  if (!dateOk(input.on_date) || input.on_date > today || input.on_date < new Date(Date.parse(today) - 14 * 86400000).toISOString().slice(0, 10))
    return { error: "That day can't be logged." };
  const amount = input.amount == null || !Number.isFinite(Number(input.amount)) ? null : num(input.amount, 0, 1000000, 0);
  const { data, error } = await supabase
    .from("habit_logs")
    .insert({
      habit_id: input.habit_id,
      on_date: input.on_date,
      status: input.status === "skip" ? "skip" : "done",
      amount: input.status === "skip" ? null : amount,
      feel: input.feel && ["tough", "good", "flying"].includes(input.feel) ? input.feel : null,
      note: clean(input.note, 500),
    })
    .select(LOG_COLUMNS)
    .single<HabitLog>();
  return error ? { error: error.message } : { row: data };
}

// Undo: takes a day's logs for a habit back off.
export async function clearDay(habitId: number, onDate: string): Promise<{ error?: string }> {
  const { supabase } = await requireEditor();
  if (!dateOk(onDate)) return { error: "That day can't be changed." };
  const { error } = await supabase.from("habit_logs").update({ gone: true }).eq("habit_id", habitId).eq("on_date", onDate).eq("gone", false);
  return error ? { error: error.message } : {};
}
