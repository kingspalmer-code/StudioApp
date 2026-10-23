// Your week: things that happen every week (office days, a regular train). Saved to your account
// (user_metadata routine), shown faintly on the To-do calendar, and told to Oatcake when it reads a
// brain dump so it plans around them.

export type RoutineBlock = {
  id: string;
  label: string;
  // 1 = Monday … 7 = Sunday.
  days: number[];
  // "08:00"; end is null for something at one time, like a train.
  start: string;
  end: string | null;
};

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const isTime = (v: unknown): v is string => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);

// Whatever's saved, tidied into blocks (anything broken is dropped).
export function readRoutine(v: unknown): RoutineBlock[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((b): RoutineBlock | null => {
      if (!b || typeof b !== "object") return null;
      const r = b as Record<string, unknown>;
      const label = typeof r.label === "string" ? r.label.trim().slice(0, 60) : "";
      const days = Array.isArray(r.days) ? [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))].sort() : [];
      if (!label || !days.length || !isTime(r.start)) return null;
      return { id: typeof r.id === "string" ? r.id : Math.random().toString(36).slice(2, 10), label, days, start: r.start, end: isTime(r.end) && r.end > r.start ? r.end : null };
    })
    .filter((b): b is RoutineBlock => b !== null)
    .slice(0, 30);
}

// 1 = Monday … 7 = Sunday, for "2026-10-27".
export const weekdayOf = (iso: string) => ((new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7) + 1;

export const routineOn = (routine: RoutineBlock[], iso: string) =>
  routine.filter((b) => b.days.includes(weekdayOf(iso))).sort((a, b) => a.start.localeCompare(b.start));

// "Tue, Thu" or "Weekdays".
export function daysLabel(days: number[]): string {
  const key = days.join("");
  if (key === "12345") return "Weekdays";
  if (key === "67") return "Weekends";
  if (key === "1234567") return "Every day";
  return days.map((d) => DAY_SHORT[d - 1]).join(", ");
}

export const blockTime = (b: Pick<RoutineBlock, "start" | "end">) => (b.end ? `${b.start}–${b.end}` : b.start);

// The block something timed on that day would land in, if any.
export function clashWith(routine: RoutineBlock[], iso: string | null, time: string | null): RoutineBlock | undefined {
  if (!iso || !time) return undefined;
  const t = time.slice(0, 5);
  return routineOn(routine, iso).find((b) => (b.end ? t >= b.start && t < b.end : t === b.start));
}
