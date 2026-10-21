import type { JobType, Priority, Stage, ListTicket, Status, Ticket } from "./types";

// A workspace's stages (in order) and job types. Job types carry the working days each kind
// of job realistically needs, which drives the start-by priority.
// noDates: the workspace hid Needed by, so jobs have no due date and nothing goes by one.
export type Ctx = { stages: Stage[]; types: JobType[]; noDates?: boolean };

export const PRIORITIES: Priority[] = ["Standard", "High", "Urgent"];
const PRIORITY_BUMP: Record<Priority, number> = { Standard: 0, High: 1, Urgent: 2 };

export const STAGE_COLORS = ["blue", "indigo", "purple", "teal", "orange", "pink", "red", "green"] as const;
export const stageColor = (c: string) => `var(--${(STAGE_COLORS as readonly string[]).includes(c) ? c : "blue"})`;

export const finalStage = (ctx: Ctx): Status => ctx.stages[ctx.stages.length - 1]?.key ?? "done";
// The stage that means "with the client to look over", if the workspace has one: the default
// "review" stage, or one whose name says so. Never the first or last stage.
export const reviewStage = (ctx: Ctx): Stage | undefined => {
  const middle = ctx.stages.slice(1, -1);
  return middle.find((s) => s.key === "review") ?? middle.find((s) => /review|approv|with (the )?client|with (the )?customer/i.test(s.label));
};
export const firstStage = (ctx: Ctx): Status => ctx.stages[0]?.key ?? "new";
export const isDone = (t: Pick<Ticket, "status">, ctx: Ctx) => t.status === finalStage(ctx);
export const stageOf = (ctx: Ctx, key: Status) => ctx.stages.find((s) => s.key === key);
export const statusLabel = (ctx: Ctx, key: Status) => stageOf(ctx, key)?.label ?? key;
export const leadDays = (ctx: Ctx, type: string) => ctx.types.find((t) => t.name === type)?.lead_days ?? 3;

const TZ = process.env.NEXT_PUBLIC_TIMEZONE || "Europe/London";
const DAY = 86_400_000;

// Today's date as YYYY-MM-DD in the studio's timezone.
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function daysFromToday(date: string): number {
  return Math.round((Date.parse(date) - Date.parse(todayISO())) / DAY);
}

// The job's needed-by date, unless it has none or the workspace works without dates.
export const dueOf = (t: Pick<Ticket, "deadline">, ctx: Ctx): string | null => (ctx.noDates ? null : t.deadline || null);

// Due between today and `days` from now.
export function dueWithin(t: Pick<Ticket, "deadline">, ctx: Ctx, days: number): boolean {
  const due = dueOf(t, ctx);
  if (!due) return false;
  const n = daysFromToday(due);
  return n >= 0 && n <= days;
}

// A far-off start for jobs with no date, so they queue after dated ones, still Urgent before Standard.
const NO_DATE = 9999;

// Days until this job should start: needed-by minus lead time, brought forward for High/Urgent.
export function startBy(t: Pick<Ticket, "deadline" | "type" | "priority">, ctx: Ctx): number {
  const due = dueOf(t, ctx);
  return (due ? daysFromToday(due) - leadDays(ctx, t.type) : NO_DATE) - PRIORITY_BUMP[t.priority];
}

// Without dates: pinned, then importance, then oldest first.
export function sortQueue<T extends ListTicket>(tickets: T[], ctx: Ctx): T[] {
  return tickets
    .filter((t) => !isDone(t, ctx))
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        startBy(a, ctx) - startBy(b, ctx) ||
        (dueOf(a, ctx) ?? "").localeCompare(dueOf(b, ctx) ?? "") ||
        a.created_at.localeCompare(b.created_at)
    );
}

export function startLabel(n: number): { text: string; tone: "" | "warm" | "hot" } {
  if (n < 0) return { text: `Start ${-n}d late`, tone: "hot" };
  if (n === 0) return { text: "Start today", tone: "hot" };
  if (n <= 2) return { text: `Start in ${n}d`, tone: "warm" };
  return { text: `Start in ${n}d`, tone: "" };
}

export function formatDate(date: string, withWeekday = false): string {
  return new Date(date.length === 10 ? date + "T12:00:00" : date).toLocaleDateString("en-GB", {
    ...(withWeekday ? { weekday: "short" as const } : {}),
    day: "numeric",
    month: "short",
    timeZone: TZ,
  });
}

// How far off a date is, for places that already show the date itself.
export function whenLabel(date: string): string {
  const n = daysFromToday(date);
  if (n < -1) return `${-n} days overdue`;
  if (n === -1) return "1 day overdue";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

export function dueLabel(date: string): string {
  const n = daysFromToday(date);
  if (n < 0) return `${-n}d overdue`;
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  return `Due ${formatDate(date)}`;
}

export function isAtRisk(t: ListTicket, ctx: Ctx): boolean {
  const due = dueOf(t, ctx);
  return !!due && !isDone(t, ctx) && (startBy(t, ctx) < 0 || (t.status === "waiting" && daysFromToday(due) <= 5));
}

export function money(n: number | null | undefined): string {
  return n == null ? "" : n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: n % 1 ? 2 : 0 });
}
