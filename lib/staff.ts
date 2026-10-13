import { todayISO } from "./priority";
import type { createClient } from "./supabase/server";
import type { StaffNote, StaffTask, StaffTick } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Where a task is up to. A one-off task an employee ticks waits for the owner to sign it off;
// daily tasks are simply done for the day.
export type TaskState = "todo" | "waiting" | "done";

// A task as a list shows it: its state, the tick behind that, its reply chain, and for daily
// tasks which of the last seven days it was done.
export type ListedTask = StaffTask & { state: TaskState; done: boolean; tick: StaffTick | null; week: boolean[]; notes: StaffNote[] };

export function lastDays(n: number): string[] {
  const today = Date.parse(todayISO() + "T12:00:00Z");
  return Array.from({ length: n }, (_, i) => new Date(today - (n - 1 - i) * 86400000).toISOString().slice(0, 10));
}

// One employee's list: what's done every day, what's waiting for sign-off, what's still to do,
// what's been signed off lately, and how far through it all they are.
// otherName names anyone the viewer can't look up (an employee can't read the owner's member row).
export async function loadStaffList(supabase: Supabase, email: string, otherName = "Your manager") {
  const { data: rows } = await supabase
    .from("staff_tasks")
    .select("id, assignee, title, details, due, daily, created_by, created_at")
    .eq("assignee", email)
    .eq("gone", false)
    .order("created_at")
    .returns<StaffTask[]>();
  const tasks = rows ?? [];
  const ids = tasks.map((t) => t.id);
  const [{ data: tickRows }, { data: noteRows }, { data: names }] = ids.length
    ? await Promise.all([
        supabase.from("staff_task_ticks").select("*").in("task_id", ids).eq("done", true).order("day", { ascending: false }).returns<StaffTick[]>(),
        supabase.from("staff_task_notes").select("*").in("task_id", ids).order("created_at").returns<StaffNote[]>(),
        supabase.from("members").select("email, full_name").returns<{ email: string; full_name: string }[]>(),
      ])
    : [{ data: [] as StaffTick[] }, { data: [] as StaffNote[] }, { data: [] as { email: string; full_name: string }[] }];
  const ticks = tickRows ?? [];
  const nameOf = Object.fromEntries((names ?? []).map((m) => [m.email, m.full_name || m.email]));
  const today = todayISO();
  const week = lastDays(7);

  const listed: ListedTask[] = tasks.map((t) => {
    const mine = ticks.filter((k) => k.task_id === t.id);
    const tick = t.daily ? (mine.find((k) => k.day === today) ?? null) : (mine[0] ?? null);
    const state: TaskState = !tick ? "todo" : t.daily || tick.confirmed_at ? "done" : "waiting";
    const days = new Set(mine.map((k) => k.day));
    const notes = (noteRows ?? []).filter((n) => n.task_id === t.id).map((n) => ({ ...n, author_name: nameOf[n.author] ?? otherName }));
    return { ...t, state, done: Boolean(tick), tick, week: week.map((d) => days.has(d)), notes };
  });

  const byDue = (a: ListedTask, b: ListedTask) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.id - b.id;
  const oneOff = listed.filter((t) => !t.daily);
  const daily = listed.filter((t) => t.daily);
  const done = oneOff
    .filter((t) => t.state === "done")
    .sort((a, b) => (b.tick?.confirmed_at ?? "").localeCompare(a.tick?.confirmed_at ?? ""));
  // Signed-off tasks drop out of the count after a week, so the bar shows what's current.
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const recentDone = done.filter((t) => (t.tick?.confirmed_at ?? "") >= weekAgo);
  const todo = oneOff.filter((t) => t.state === "todo").sort(byDue);
  const waiting = oneOff.filter((t) => t.state === "waiting");
  return {
    daily,
    waiting,
    todo,
    done: done.slice(0, 30),
    today,
    progress: {
      done: recentDone.length + daily.filter((t) => t.done).length,
      waiting: waiting.length,
      todo: todo.length + daily.filter((t) => !t.done).length,
      late: todo.filter((t) => t.due && t.due < today).length,
    },
  };
}
