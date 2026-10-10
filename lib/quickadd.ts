import { todayISO } from "./priority";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Reads a typed to-do like "Call printer tomorrow !" into a title, due date and flag.
// Understands today, tonight, tomorrow, weekday names (next occurrence), "next week", and "!" for flagged.
export function parseQuickAdd(input: string): { title: string; due: string | null; flagged: boolean } {
  let text = ` ${input.trim()} `;
  let flagged = false;
  if (/\s!+\s/.test(text) || /!\s*$/.test(text)) {
    flagged = true;
    text = text.replace(/\s!+(?=\s)/g, " ").replace(/!+\s*$/, " ");
  }
  const today = todayISO();
  let due: string | null = null;
  const take = (re: RegExp, value: string) => {
    if (due === null && re.test(text)) {
      due = value;
      text = text.replace(re, " ");
    }
  };
  take(/\s(today|tonight)\s/i, today);
  take(/\s(tomorrow|tmrw|tmr)\s/i, addDays(today, 1));
  take(/\snext week\s/i, addDays(today, 7));
  const m = /\s(?:on\s+|by\s+)?(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)\s/i.exec(text);
  if (due === null && m) {
    const target = DAYS.findIndex((d) => d.startsWith(m[1].toLowerCase().slice(0, 3)));
    const now = new Date(today + "T12:00:00Z").getUTCDay();
    due = addDays(today, ((target - now + 7) % 7) || 7);
    text = text.replace(m[0], " ");
  }
  const title = text.replace(/\s+/g, " ").trim();
  return { title: title || input.trim(), due, flagged };
}
