// Habits (migration 050): everyone's own, private to them. Each habit has its own pace and its own
// way of logging; a day is logged by sliding right, or skipped by sliding left. Misses never reset
// anything: they show as soft hatched days, and after a couple the page offers an easier goal.
// Shared by the page, its actions and the nudges (push_due_habits counts periods the same way).
import { addDays } from "./plan";

export type HabitKind = "session" | "count" | "money";
export type HabitFreq = "daily" | "days" | "times";
export type HabitPart = "morning" | "afternoon" | "evening" | "any";

export type Goal = { freq: HabitFreq; days: number[]; times_per: number; period_weeks: number; per_day: number };

export type Habit = Goal & {
  id: number;
  name: string;
  kind: HabitKind;
  icon: string;
  colour: string;
  unit: string;
  labels: string[];
  part: HabitPart;
  remind_at: string | null;
  eased_from: Goal | null;
  ease_asked_on: string | null;
  rank: number;
  created_at: string;
};

export type HabitLog = {
  id: number;
  habit_id: number;
  on_date: string;
  status: "done" | "skip";
  amount: number | null;
  feel: "tough" | "good" | "flying" | null;
  note: string;
};

export const HABIT_COLUMNS = "id, name, kind, icon, colour, unit, per_day, labels, freq, days, times_per, period_weeks, part, remind_at, eased_from, ease_asked_on, rank, created_at";
export const LOG_COLUMNS = "id, habit_id, on_date, status, amount, feel, note";

// Line icons in the same hand as the menu's (components/NavIcons.tsx): 24 square, stroked.
export const HABIT_ICONS: Record<string, string> = {
  run: "M8 9.5 11.5 7l3.5 3 3 1M11.5 7l-2 5.5 3.5 2.5-1.5 5M9.5 12.5 7 15H4M15 6.1a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z",
  yoga: "M12 8v5M4.5 10.5 12 9l7.5 1.5M12 13l-4 3.5h8L12 13M5 19.5h14M12 6.1a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z",
  water: "M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5ZM9 14.5a3 3 0 0 0 3 3",
  teeth: "M3 15h9M12 13h8.5v4H12zM13.5 13v-3M16 13v-3M18.5 13v-3",
  meal: "M3.5 11.5h17a8.5 8.5 0 0 1-17 0ZM9 8c0-1.5 1.2-2 1.2-3.5M13.5 8c0-1.5 1.2-2 1.2-3.5",
  money: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM14.6 8.6A2.4 2.4 0 0 0 10.4 10v6M8.6 12.6h4.6M8.6 16h6.6",
  walk: "M13 7.5 10.5 12l3 2.5L12.5 20M10.5 12l-2.5 1V10l3-2.5h2l2 3 2.5 1M10.5 16 8 20M13.5 5.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z",
  bike: "M6 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM18 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM6 14.5l4-6.5h5l3 6.5M10 8l2.5 6.5H6M13.5 5.5h2.5",
  weights: "M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11",
  book: "M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5V5.5ZM12 6v13.5",
  sleep: "M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10ZM15 4h4l-4 4.5h4",
  mind: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  pill: "M10.5 20.5a4.95 4.95 0 0 1-7-7l6-6a4.95 4.95 0 0 1 7 7l-6 6ZM6.5 10.5l7 7",
  plant: "M12 21v-9M12 12c0-4 3-7 7.5-7 0 4.5-3 7-7.5 7ZM12 15c0-3-2.5-5.5-6.5-5.5 0 3.5 2.5 5.5 6.5 5.5ZM8 21h8",
  pen: "M16.5 4.5l3 3L8 19l-4 1 1-4L16.5 4.5ZM14 7l3 3",
  music: "M9 18V5.5l11-2V16M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM20 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
  phone: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM4 4l16 16M11 18h2",
  heart: "M12 20s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 7.5 4.3 4.3 0 0 1 19.5 10c0 5.5-7.5 10-7.5 10Z",
  sun: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
  spark: "M12 3v5M12 16v5M3 12h5M16 12h5M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
};

export const HABIT_COLOURS = ["#d9822b", "#94508f", "#3a6ea5", "#2f8a86", "#7c9a3a", "#8a6a5c", "#c8456b", "#5856a6"];

export const PARTS: { key: HabitPart; label: string; icon: string }[] = [
  { key: "morning", label: "Morning", icon: "sun" },
  { key: "afternoon", label: "Afternoon", icon: "spark" },
  { key: "evening", label: "Evening", icon: "sleep" },
  { key: "any", label: "Any time", icon: "mind" },
];

// Ready-made habits to start from, each pitched gently ("start comfortably").
export type Starter = Omit<Habit, "id" | "rank" | "created_at" | "eased_from" | "ease_asked_on" | "remind_at">;
export const STARTERS: Starter[] = [
  { name: "Running", kind: "session", icon: "run", colour: "#d9822b", unit: "km", per_day: 1, labels: [], freq: "times", days: [], times_per: 2, period_weeks: 1, part: "morning" },
  { name: "Yoga", kind: "session", icon: "yoga", colour: "#94508f", unit: "min", per_day: 1, labels: [], freq: "times", days: [], times_per: 1, period_weeks: 1, part: "any" },
  { name: "Drink water", kind: "count", icon: "water", colour: "#3a6ea5", unit: "glasses", per_day: 6, labels: [], freq: "daily", days: [], times_per: 1, period_weeks: 1, part: "any" },
  { name: "Brush teeth", kind: "count", icon: "teeth", colour: "#2f8a86", unit: "", per_day: 2, labels: ["Morning", "Night"], freq: "daily", days: [], times_per: 1, period_weeks: 1, part: "any" },
  { name: "3 healthy meals", kind: "count", icon: "meal", colour: "#7c9a3a", unit: "", per_day: 3, labels: ["Breakfast", "Lunch", "Dinner"], freq: "daily", days: [], times_per: 1, period_weeks: 1, part: "any" },
  { name: "Spend under £20", kind: "money", icon: "money", colour: "#8a6a5c", unit: "£", per_day: 20, labels: [], freq: "days", days: [0, 1, 2, 3, 4], times_per: 1, period_weeks: 1, part: "evening" },
];

export const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// 0 = Monday.
export const weekday = (iso: string) => (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7;
export const mondayOf = (iso: string) => addDays(iso, -weekday(iso));
const EPOCH = "2024-01-01"; // a Monday; "every N weeks" periods count from here
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);

// The first day of the stretch a "times every N weeks" goal is counted over.
export function periodStart(g: Goal, iso: string): string {
  const monday = mondayOf(iso);
  const weeks = Math.floor(daysBetween(EPOCH, monday) / 7);
  return addDays(monday, -((weeks % g.period_weeks) * 7));
}

// "2× a week", "Every day", "Mon, Wed, Fri", "Once every 2 weeks".
export function paceLabel(g: Goal): string {
  if (g.freq === "daily") return "Every day";
  if (g.freq === "days") {
    const d = [...g.days].sort();
    if (d.length === 5 && d.every((x, i) => x === i)) return "Weekdays";
    if (d.length === 2 && d[0] === 5 && d[1] === 6) return "Weekends";
    return d.map((x) => WEEKDAY_NAMES[x]).join(", ") || "No days picked";
  }
  const n = g.times_per === 1 ? "Once" : `${g.times_per}×`;
  return g.period_weeks === 1 ? `${n} a week` : `${n} every ${g.period_weeks} weeks`;
}

// What a day's logs add up to for one habit.
export type Day = { done: boolean; skipped: boolean; amount: number; logs: HabitLog[] };

export function dayOf(h: Habit, logs: HabitLog[]): Day {
  const done = logs.filter((l) => l.status === "done");
  const amount = done.reduce((a, l) => a + (l.amount ?? (h.kind === "count" ? 1 : 0)), 0);
  const isDone =
    h.kind === "count" ? amount >= h.per_day
    : h.kind === "money" ? done.length > 0 && amount <= h.per_day
    : done.length > 0;
  return { done: isDone, skipped: !isDone && logs.some((l) => l.status === "skip"), amount, logs };
}

// Logs grouped by habit and day: byDay.get(habitId)?.get(date).
export function indexLogs(logs: HabitLog[]): Map<number, Map<string, HabitLog[]>> {
  const out = new Map<number, Map<string, HabitLog[]>>();
  for (const l of logs) {
    let m = out.get(l.habit_id);
    if (!m) out.set(l.habit_id, (m = new Map()));
    const list = m.get(l.on_date);
    if (list) list.push(l);
    else m.set(l.on_date, [l]);
  }
  return out;
}

export type HabitStats = {
  // Is it something to do today (or already done today)?
  dueToday: boolean;
  today: Day;
  // Done so far in the current stretch, and what the stretch asks for (times goals; days for the others this week).
  periodDone: number;
  periodGoal: number;
  // This week, 0–1.
  week: number;
  // Stretches hit since it started; misses pause it and never reset it.
  streak: number;
  // Longest run of stretches hit without a miss.
  best: number;
  checkIns: number;
  // A stretch is a day for daily/days goals, and the counted weeks for times goals.
  unit: "day" | "wk";
  // Recent stretches, newest last: true hit, false missed (skips count as missed), for the ease-off card.
  recent: boolean[];
  usual: number | null;
  longest: number | null;
};

const startOf = (h: Habit) => h.created_at.slice(0, 10);

export function isScheduled(h: Goal, iso: string) {
  return h.freq === "daily" || (h.freq === "days" && h.days.includes(weekday(iso)));
}

export function statsFor(h: Habit, days: Map<string, HabitLog[]> | undefined, today: string): HabitStats {
  const at = (iso: string) => dayOf(h, days?.get(iso) ?? []);
  const first = [...(days?.keys() ?? [])].sort()[0];
  const start = first && first < startOf(h) ? first : startOf(h);
  const todayDay = at(today);
  let checkIns = 0;
  const amounts: number[] = [];
  for (const [, logs] of days ?? []) {
    const d = dayOf(h, logs);
    if (d.done) checkIns++;
    if (h.kind === "session") for (const l of logs) if (l.status === "done" && l.amount) amounts.push(Number(l.amount));
  }
  const usual = amounts.length ? Math.round((amounts.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, amounts.length)) * 10) / 10 : null;
  const longest = amounts.length ? Math.max(...amounts) : null;

  // Walk the stretches from the start to now.
  const results: boolean[] = [];
  if (h.freq === "times") {
    for (let p = periodStart(h, start); p <= today; p = addDays(p, 7 * h.period_weeks)) {
      const end = addDays(p, 7 * h.period_weeks - 1);
      let n = 0;
      for (let d = p; d <= end && d <= today; d = addDays(d, 1)) if (at(d).done) n++;
      // The stretch we're in only counts once it's hit.
      if (end >= today && n < h.times_per) break;
      results.push(n >= h.times_per);
    }
  } else {
    for (let d = start; d <= today; d = addDays(d, 1)) {
      if (!isScheduled(h, d)) continue;
      const day = at(d);
      if (d === today && !day.done) break;
      results.push(day.done);
    }
  }
  let streak = 0, best = 0, run = 0;
  for (const r of results) {
    if (r) { streak++; run++; best = Math.max(best, run); }
    else run = 0;
  }

  // This stretch and this week.
  const monday = mondayOf(today);
  let periodDone = 0, periodGoal = 0, week = 0;
  if (h.freq === "times") {
    const p = periodStart(h, today);
    for (let d = p; d <= today; d = addDays(d, 1)) if (at(d).done) periodDone++;
    periodGoal = h.times_per;
    week = Math.min(1, periodDone / h.times_per);
  } else {
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      if (!isScheduled(h, d)) continue;
      periodGoal++;
      if (at(d).done) periodDone++;
    }
    week = periodGoal ? periodDone / periodGoal : 0;
  }
  const dueToday = h.freq === "times" ? periodDone < h.times_per || todayDay.done || todayDay.logs.length > 0 : isScheduled(h, today);
  return { dueToday, today: todayDay, periodDone, periodGoal, week, streak, best, checkIns, unit: h.freq === "times" ? "wk" : "day", recent: results.slice(-6), usual, longest };
}

// An easier goal after a couple of misses, and the old one back after a good run.
export function easierGoal(g: Goal, kind: HabitKind): Goal | null {
  if (kind === "count" && g.per_day > 1 && g.freq === "daily") return { ...g, per_day: g.per_day - 1 };
  if (g.freq === "daily") return { ...g, freq: "times", times_per: 5, period_weeks: 1, days: [] };
  if (g.freq === "days") return g.days.length > 1 ? { ...g, freq: "times", times_per: g.days.length - 1, period_weeks: 1, days: [] } : { ...g, freq: "times", times_per: 1, period_weeks: 2, days: [] };
  if (g.times_per > 1) return { ...g, times_per: g.times_per - 1 };
  if (g.period_weeks < 8) return { ...g, period_weeks: g.period_weeks + 1 };
  return null;
}

export type Nudge = { kind: "ease" | "up"; goal: Goal; misses: number };

// Whether to show the "kinder goal?" card (or "step back up?") for a habit. Asked at most once a fortnight.
export function easeNudge(h: Habit, s: HabitStats, today: string): Nudge | null {
  if (h.ease_asked_on && daysBetween(h.ease_asked_on, today) < 14) return null;
  if (daysBetween(startOf(h), today) < 7) return null;
  const window = h.freq === "times" ? s.recent.slice(-3) : s.recent.slice(-7);
  const misses = window.filter((r) => !r).length;
  if (h.eased_from && s.recent.length >= 3 && s.recent.slice(-3).every(Boolean)) return { kind: "up", goal: h.eased_from, misses: 0 };
  if (misses >= 2) {
    const goal = easierGoal(h, h.kind);
    if (goal) return { kind: "ease", goal, misses };
  }
  return null;
}

export const goalOf = (h: Goal): Goal => ({ freq: h.freq, days: h.days, times_per: h.times_per, period_weeks: h.period_weeks, per_day: h.per_day });

// "6 glasses", "£20", "3.4 km".
export function amountLabel(h: Pick<Habit, "kind" | "unit">, n: number) {
  if (h.kind === "money") return `£${Number.isInteger(n) ? n : n.toFixed(2)}`;
  return [Number.isInteger(n) ? n : n.toFixed(1), h.unit].filter((x) => x !== "").join(" ");
}

// What a habit asks each time: "6 glasses a day", "Under £20".
export function perDayLabel(h: Habit) {
  if (h.kind === "count") return h.labels.length ? h.labels.join(" · ") : `${amountLabel(h, h.per_day)} a day`;
  if (h.kind === "money") return `Under £${h.per_day}`;
  return "";
}
