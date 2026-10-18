// Hours worked on jobs (migration 038). Logged from the job page or from a to-do on the calendar;
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
