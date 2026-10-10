import type { Priority, Status, Ticket } from "./types";

// Working days each kind of job realistically needs. Edit these to tune the queue.
export const TYPES = [
  { id: "Poster", lead: 5, why: "Design, two rounds of changes, print turnaround" },
  { id: "Social media", lead: 2, why: "Quick turnaround, one round of changes" },
  { id: "Menu", lead: 5, why: "Copy and price checks, print" },
  { id: "Merch", lead: 10, why: "Supplier proofs and production" },
  { id: "Website", lead: 12, why: "Layouts, build, review" },
  { id: "Photoshoot", lead: 4, why: "Planning, shoot day, edit" },
  { id: "Other", lead: 3, why: "Default until the type is known" },
] as const;

export const PRIORITIES: Priority[] = ["Standard", "High", "Urgent"];
const PRIORITY_BUMP: Record<Priority, number> = { Standard: 0, High: 1, Urgent: 2 };

export const STATUSES: { id: Status; label: string; color: string }[] = [
  { id: "new", label: "New", color: "var(--accent)" },
  { id: "progress", label: "In progress", color: "var(--indigo)" },
  { id: "review", label: "With client", color: "var(--purple)" },
  { id: "waiting", label: "Waiting on client", color: "var(--orange)" },
  { id: "done", label: "Delivered", color: "var(--green)" },
];

export const statusLabel = (s: Status) => STATUSES.find((x) => x.id === s)?.label ?? s;
export const leadDays = (type: string) => (TYPES.find((t) => t.id === type) ?? TYPES[TYPES.length - 1]).lead;

const TZ = process.env.NEXT_PUBLIC_TIMEZONE || "Europe/London";
const DAY = 86_400_000;

// Today's date as YYYY-MM-DD in the studio's timezone.
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function daysFromToday(date: string): number {
  return Math.round((Date.parse(date) - Date.parse(todayISO())) / DAY);
}

// Days until this job should start: needed-by minus lead time, brought forward for High/Urgent.
export function startBy(t: Pick<Ticket, "deadline" | "type" | "priority">): number {
  return daysFromToday(t.deadline) - leadDays(t.type) - PRIORITY_BUMP[t.priority];
}

export function sortQueue<T extends Ticket>(tickets: T[]): T[] {
  return tickets
    .filter((t) => t.status !== "done")
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || startBy(a) - startBy(b) || a.deadline.localeCompare(b.deadline)
    );
}

export function startLabel(n: number): { text: string; tone: "" | "warm" | "hot" } {
  if (n < 0) return { text: `Start ${-n}d late`, tone: "hot" };
  if (n === 0) return { text: "Start today", tone: "hot" };
  if (n <= 2) return { text: `Start in ${n}d`, tone: "warm" };
  return { text: `Start in ${n}d`, tone: "" };
}

export function formatDate(date: string): string {
  return new Date(date.length === 10 ? date + "T12:00:00" : date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: TZ,
  });
}

export function dueLabel(date: string): string {
  const n = daysFromToday(date);
  if (n < 0) return `${-n}d overdue`;
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  return `Due ${formatDate(date)}`;
}

export function isAtRisk(t: Ticket): boolean {
  return t.status !== "done" && (startBy(t) < 0 || (t.status === "waiting" && daysFromToday(t.deadline) <= 5));
}
