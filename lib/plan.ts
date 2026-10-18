// The calendar's to-do list (migration 037): to-dos in priority order, each with steps, and every
// one with a day showing on the calendar. Shared by the page, its actions and the reminders job.

export type PlanItem = {
  id: number;
  owner: string;
  parent_id: number | null;
  ticket_id: number | null;
  title: string;
  notes: string;
  rank: number;
  on_date: string | null;
  // "14:30:00" as the database gives it, or null for any time that day.
  at_time: string | null;
  // Minutes before to remind, or null for no reminder.
  remind: number | null;
  done_at: string | null;
  created_by: string;
};

export const PLAN_COLUMNS = "id, owner, parent_id, ticket_id, title, notes, rank, on_date, at_time, remind, done_at, created_by";

export const REMIND_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "No reminder" },
  { value: 0, label: "At the time" },
  { value: 15, label: "15 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "The day before" },
];

const TZ = process.env.NEXT_PUBLIC_TIMEZONE || "Europe/London";
const DAY_MS = 86400000;

export const isoOf = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => isoOf(new Date(Date.parse(iso + "T12:00:00Z") + n * DAY_MS));
export const todayIn = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// "14:30" from "14:30:00".
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

// The weeks of a month, Monday first, each day as an ISO date. month is "2026-10".
export function monthDays(month: string): string[] {
  const first = month + "-01";
  const weekday = (new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7;
  const start = addDays(first, -weekday);
  const next = addDays(first, 32).slice(0, 7) + "-01";
  const days: string[] = [];
  for (let d = start; d < next || days.length % 7; d = addDays(d, 1)) days.push(d);
  return days;
}

export const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export const monthName = (month: string) =>
  new Date(month + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export const dayName = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// "Today · 14:30", "Tomorrow", "Tue 21 Oct · 09:00".
export function planWhen(date: string | null, time: string | null, today = todayIn()): string {
  if (!date) return "";
  const n = Math.round((Date.parse(date) - Date.parse(today)) / DAY_MS);
  const day =
    n === 0 ? "Today"
    : n === 1 ? "Tomorrow"
    : n === -1 ? "Yesterday"
    : new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return time ? `${day} · ${hhmm(time)}` : day;
}

// Calendar order within a day: timed things first by time, then the rest by priority.
export const byTime = (a: PlanItem, b: PlanItem) =>
  (a.at_time ?? "99").localeCompare(b.at_time ?? "99") || a.rank - b.rank || a.id - b.id;

export const byRank = (a: PlanItem, b: PlanItem) => a.rank - b.rank || a.id - b.id;
