// Hours worked on jobs (migration 039). Logged from the job page or from a to-do on the calendar;
// a job's hours add up on its page. A running timer is a log with started_at and no minutes yet.

export type TimeLog = {
  id: number;
  who: string;
  ticket_id: number | null;
  plan_item_id: number | null;
  day: string;
  minutes: number | null;
  started_at: string | null;
  note: string;
};

export const TIME_COLUMNS = "id, who, ticket_id, plan_item_id, day, minutes, started_at, note";

// How long a log counts for: its minutes, or for a running timer, the time so far.
export const minutesOf = (l: TimeLog, now = Date.now()) =>
  l.minutes ?? (l.started_at ? Math.max(0, Math.floor((now - Date.parse(l.started_at)) / 60000)) : 0);

export const totalMinutes = (logs: TimeLog[], now = Date.now()) => logs.reduce((sum, l) => sum + minutesOf(l, now), 0);

// "2h 30m", "45m", "0m".
export function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

// A running timer as a clock: "1:04:09".
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
}

// What people type: "1.5", "1:30", "90m", "2h", "2h 15m", "1,5". Null if it isn't a time.
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  let m: RegExpMatchArray | null;
  let mins: number;
  if ((m = s.match(/^(\d+):(\d{1,2})$/))) mins = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/)) && (m[1] || m[2])) mins = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  else if (/^\d+(\.\d+)?$/.test(s)) mins = Number(s) * 60;
  else return null;
  mins = Math.round(mins);
  return mins >= 1 && mins <= 10080 ? mins : null;
}

// Hours per person, most first, for a job's Hours section.
export function byPerson(logs: TimeLog[], now = Date.now()): { who: string; minutes: number }[] {
  const sums = new Map<string, number>();
  for (const l of logs) sums.set(l.who, (sums.get(l.who) ?? 0) + minutesOf(l, now));
  return [...sums].map(([who, minutes]) => ({ who, minutes })).sort((a, b) => b.minutes - a.minutes);
}

// Hours and pay (/hours, migration 055): what kind of work a log was, the hourly rate it's paid at,
// and when the owner marked it paid. Kept apart from TIME_COLUMNS so the To-do and job pages don't
// depend on these columns.
export type PayLog = TimeLog & { work_type: string; rate: number | null; paid_at: string | null };
export const PAY_COLUMNS = `${TIME_COLUMNS}, work_type, rate, paid_at`;

export const round2 = (n: number) => Math.round(n * 100) / 100;

// What a log earns: its time at its rate. Nothing for a log without a rate, or a timer still running.
export const payOf = (l: PayLog) => (l.minutes != null && l.rate != null ? round2((l.minutes / 60) * Number(l.rate)) : 0);

// "1.5h", "45m" style hours as a plain decimal for tables: 1.5, 0.75.
export const hoursOf = (minutes: number) => round2(minutes / 60);

// Hours and pay for a set of logs: the total, what's earned, what's still owed (unpaid), and how
// much time has no rate yet, so nobody is quietly short-changed.
export function payTotals(logs: PayLog[], now = Date.now()) {
  let minutes = 0, pay = 0, owed = 0, paid = 0, noRate = 0;
  for (const l of logs) {
    const m = minutesOf(l, now);
    const p = payOf(l);
    minutes += m;
    pay += p;
    if (l.paid_at) paid += p;
    else owed += p;
    if (l.rate == null && l.minutes != null) noRate += m;
  }
  return { minutes, pay: round2(pay), owed: round2(owed), paid: round2(paid), noRate };
}

// Logs grouped by a key (a job, a type of work), most time first.
export function groupLogs(logs: PayLog[], key: (l: PayLog) => string, now = Date.now()) {
  const groups = new Map<string, PayLog[]>();
  for (const l of logs) {
    const k = key(l);
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  return [...groups].map(([k, ls]) => ({ key: k, logs: ls, ...payTotals(ls, now) })).sort((a, b) => b.minutes - a.minutes);
}

// The periods the page looks at, as [from, to) ISO days. Weeks start on Monday.
export type Period = "week" | "month" | "last" | "year" | "all";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All" },
];
export function periodRange(p: Period, today: string): [string, string] {
  const d = new Date(today + "T12:00:00Z");
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (p === "week") {
    const start = new Date(d);
    start.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
    return [iso(start), iso(end)];
  }
  if (p === "month") return [iso(new Date(Date.UTC(y, m, 1))), iso(new Date(Date.UTC(y, m + 1, 1)))];
  if (p === "last") return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 1)))];
  if (p === "year") return [`${y}-01-01`, `${y + 1}-01-01`];
  return ["0000-01-01", "9999-12-31"];
}
