import { todayISO } from "./priority";
import type { createClient } from "./supabase/server";
import type { StaffTask, StaffTick } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// A task as a list shows it: whether it's done (today, for a daily one), the note on that ticking-off,
// and for daily tasks which of the last seven days it was done.
export type ListedTask = StaffTask & { done: boolean; tick: StaffTick | null; week: boolean[] };

export function lastDays(n: number): string[] {
  const today = Date.parse(todayISO() + "T12:00:00Z");
  return Array.from({ length: n }, (_, i) => new Date(today - (n - 1 - i) * 86400000).toISOString().slice(0, 10));
}

// One employee's list, split into what's done every day, what's still to do, and what's been done lately.
export async function loadStaffList(supabase: Supabase, email: string) {
  const { data: rows } = await supabase
    .from("staff_tasks")
    .select("id, assignee, title, due, daily, created_by, created_at")
    .eq("assignee", email)
    .eq("gone", false)
    .order("created_at")
    .returns<StaffTask[]>();
  const tasks = rows ?? [];
  const { data: tickRows } = tasks.length
    ? await supabase
        .from("staff_task_ticks")
        .select("*")
        .in("task_id", tasks.map((t) => t.id))
        .eq("done", true)
        .order("day", { ascending: false })
        .returns<StaffTick[]>()
    : { data: [] as StaffTick[] };
  const ticks = tickRows ?? [];
  const today = todayISO();
  const week = lastDays(7);

  const listed: ListedTask[] = tasks.map((t) => {
    const mine = ticks.filter((k) => k.task_id === t.id);
    const tick = t.daily ? (mine.find((k) => k.day === today) ?? null) : (mine[0] ?? null);
    const days = new Set(mine.map((k) => k.day));
    return { ...t, done: Boolean(tick), tick, week: week.map((d) => days.has(d)) };
  });

  const byDue = (a: ListedTask, b: ListedTask) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.id - b.id;
  return {
    daily: listed.filter((t) => t.daily),
    todo: listed.filter((t) => !t.daily && !t.done).sort(byDue),
    done: listed
      .filter((t) => !t.daily && t.done)
      .sort((a, b) => (b.tick?.done_at ?? "").localeCompare(a.tick?.done_at ?? ""))
      .slice(0, 30),
    today,
  };
}
