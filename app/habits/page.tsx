import Shell from "@/components/Shell";
import { addDays, todayIn } from "@/lib/plan";
import { requireMember } from "@/lib/session";
import { HABIT_COLUMNS, LOG_COLUMNS, type Habit, type HabitLog } from "@/lib/habits";
import Habits from "./Habits";
import "./habits.css";

// Habits: everyone's own, whatever kind of login. Today's list, slide to log, and the week, month
// and year zoomed out. Logs go back a year and a bit, enough for the year grid.
export default async function HabitsPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const { h } = await searchParams;
  const { supabase, shell, viewing, member } = await requireMember();
  const today = todayIn();
  const [{ data: habits }, { data: logs }] = await Promise.all([
    supabase.from("habits").select(HABIT_COLUMNS).eq("gone", false).order("rank").order("id").returns<Habit[]>(),
    supabase.from("habit_logs").select(LOG_COLUMNS).eq("gone", false).gte("on_date", addDays(today, -380)).order("created_at").limit(20000).returns<HabitLog[]>(),
  ]);
  return (
    <Shell {...shell}>
      <Habits initial={habits ?? []} initialLogs={logs ?? []} today={today} readOnly={viewing} openId={Number(h) || undefined} brain={Boolean(process.env.ANTHROPIC_API_KEY) && !viewing && member.role === "designer" && !member.staff} />
    </Shell>
  );
}
