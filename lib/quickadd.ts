import { todayISO } from "./priority";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)";
const ORD = "(\\d{1,2})(?:st|nd|rd|th)?";

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// A day of a month as an ISO date: this year's, or next year's once this year's has gone by.
// Null for days that don't exist, like the 31st of June.
function dayOf(day: number, month: number, today: string, year?: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  let y = year ?? Number(today.slice(0, 4));
  const iso = (yy: number) => `${yy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (new Date(Date.UTC(y, month - 1, day)).getUTCDate() !== day) return null;
  if (year === undefined && iso(y) < today) y += 1;
  return iso(y);
}

export type QuickItem = { title: string; due: string | null; time: string | null; place: string; flagged: boolean };

type Found = { due: string | null; time: string | null; text: string; ledWithDay: boolean };

// Finds a day and a time in one piece of a note, and takes them out of the words. `month` is the
// month said last in the note, so "14th Nov & 15th" reads the 15th as November too.
function findWhen(input: string, today: string, month: number | null): Found {
  let text = ` ${input} `;
  let due: string | null = null;
  let time: string | null = null;
  let at = -1;
  const take = (re: RegExp, read: (m: RegExpExecArray) => string | null) => {
    if (due !== null) return;
    const m = re.exec(text);
    if (!m) return;
    const value = read(m);
    if (!value) return;
    due = value;
    at = m.index;
    text = text.slice(0, m.index) + " " + text.slice(m.index + m[0].length);
  };
  const monthNo = (s: string) => MONTHS.indexOf(s.toLowerCase().slice(0, 3)) + 1;
  // "5th of November", "14 Nov", "November 5th", "5/11", "5/11/27", then a bare "the 15th".
  take(new RegExp(`\\s(?:on\\s+)?(?:the\\s+)?${ORD}\\s+(?:of\\s+)?${MONTH}(?:\\s+(\\d{4}))?(?=[\\s,.;!?])`, "i"), (m) => dayOf(Number(m[1]), monthNo(m[2]), today, m[3] ? Number(m[3]) : undefined));
  take(new RegExp(`\\s(?:on\\s+)?${MONTH}\\s+(?:the\\s+)?${ORD}(?:,?\\s+(\\d{4}))?(?=[\\s,.;!?])`, "i"), (m) => dayOf(Number(m[2]), monthNo(m[1]), today, m[3] ? Number(m[3]) : undefined));
  take(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?=[\s,.;!?])/, (m) => dayOf(Number(m[1]), Number(m[2]), today, m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : undefined));
  take(/\s(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)(?=[\s,.;!?])/i, (m) => {
    const day = Number(m[1]);
    if (month) return dayOf(day, month, today);
    // No month said: this month's, or next month's once this month's has gone by.
    const thisMonth = Number(today.slice(5, 7));
    return day >= Number(today.slice(8)) ? dayOf(day, thisMonth, today) : dayOf(day, (thisMonth % 12) + 1, today);
  });
  take(/\s(today|tonight)(?=[\s,.;!?])/i, () => today);
  take(/\s(tomorrow|tmrw|tmr)(?=[\s,.;!?])/i, () => addDays(today, 1));
  take(/\snext week(?=[\s,.;!?])/i, () => addDays(today, 7));
  take(/\s(?:on\s+|by\s+|this\s+)?(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)(?=[\s,.;!?])/i, (m) => {
    const target = DAYS.findIndex((d) => d.startsWith(m[1].toLowerCase().slice(0, 3)));
    const now = new Date(today + "T12:00:00Z").getUTCDay();
    return addDays(today, ((target - now + 7) % 7) || 7);
  });
  // "at 3pm", "7.30pm", "14:30", "noon".
  const t = /\s(?:at\s+|@\s*|from\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)(?=[\s,.;!?])/i.exec(text)
    ?? /\s(?:at\s+|@\s*|from\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=[\s,.;!?])/.exec(text)
    ?? /\s(?:at\s+)?(noon|midday)(?=[\s,.;!?])/i.exec(text);
  if (t) {
    let h = /noon|midday/i.test(t[1]) ? 12 : Number(t[1]);
    const ampm = t[3]?.toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    if (h <= 23) {
      time = `${String(h).padStart(2, "0")}:${t[2] ?? "00"}`;
      text = text.slice(0, t.index) + " " + text.slice(t.index + t[0].length);
    }
  }
  return { due, time, text, ledWithDay: due !== null && text.slice(0, at).trim() === "" };
}

// "at Bam Bam Studios" at the end of something with a day is where it happens. Not "at home",
// "at work" or "look at the website".
const NOT_PLACES = /^(home|work|least|last|all|once|it|this|that|them|him|her|me|you|the (website|site|email|list|form|draft|quote|invoice|file|files|photos|plan))\b/i;
function findPlace(text: string): { text: string; place: string } {
  const m = /\s(?:at|@)\s+([^,;]+?)\s*$/i.exec(text);
  if (!m || NOT_PLACES.test(m[1]) || /^\d/.test(m[1]) || /\b(look|looking|laugh|stare|glance|aim|good|bad)$/i.test(text.slice(0, m.index).trim())) return { text, place: "" };
  return { text: text.slice(0, m.index), place: m[1].trim() };
}

function tidy(text: string, ledWithDay: boolean): string {
  let t = text.replace(/\s+/g, " ").trim();
  // The little words left either side of where the day was: "photoshoot on the", "& for Gently Tender".
  t = t.replace(/^[,;&+\-–\s]+|[,;&+\-–\s]+$/g, "").replace(/\s+(on|on the|by|at|from|for)$/i, "");
  if (ledWithDay) t = t.replace(/^(for|is|it's|its|there's|-|:)\s+/i, "");
  t = t.replace(/^(and|&)\s+/i, "");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

// Reads what's typed into "What's on your mind?" into one or more things. Each piece with its own
// day ("photoshoot 5th Nov, live session 14th Nov at Bam Bam & 15th for Gently Tender") becomes
// its own item; pieces without one stay with the piece before ("milk, eggs and bread friday" is
// one thing). Understands today, tomorrow, weekdays, "next week", dates like "5th of November",
// "Nov 14" or "5/11", a bare "15th", times like "3pm" or "14:30", "at <place>" after a day, and
// "!" to put it at the top of the list.
export function parseCapture(input: string, today = todayISO()): QuickItem[] {
  let raw = input.trim();
  let flagged = false;
  if (/(^|\s)!+(\s|$)/.test(raw) || /!\s*$/.test(raw)) {
    flagged = true;
    raw = raw.replace(/(^|\s)!+(?=\s|$)/g, " ").replace(/!+\s*$/, " ").trim();
  }
  const pieces = raw.split(/\s*(?:,|;|\n|\s&\s|\sand\s|\s\+\s|\sthen\s)\s*/i).filter(Boolean);
  let month: number | null = null;
  const groups: { text: string; dated: boolean }[] = [];
  for (const piece of pieces) {
    const f = findWhen(piece, today, month);
    if (f.due) month = Number((f.due as string).slice(5, 7));
    const dated = f.due !== null;
    const last = groups[groups.length - 1];
    if (last && !(dated && last.dated)) {
      last.text += (/^(and|&)\s/i.test(piece) ? " " : ", ") + piece;
      last.dated ||= dated;
    } else groups.push({ text: piece, dated });
  }
  month = null;
  const read = (text: string): QuickItem => {
    const f = findWhen(text, today, month);
    if (f.due) month = Number((f.due as string).slice(5, 7));
    const due = f.due ?? (f.time ? today : null);
    const p = due ? findPlace(f.text) : { text: f.text, place: "" };
    return { title: tidy(p.text, f.ledWithDay) || tidy(text, false), due, time: f.time, place: p.place, flagged };
  };
  // Only split when at least two pieces each have their own day.
  return groups.filter((g) => g.dated).length < 2 ? [read(raw)] : groups.map((g) => read(g.text));
}

// One line, one thing: the + button's Task, typed like "Call supplier tomorrow !".
export function parseQuickAdd(input: string): { title: string; due: string | null; flagged: boolean } {
  const [first] = parseCapture(input);
  return { title: first.title, due: first.due, flagged: first.flagged };
}
