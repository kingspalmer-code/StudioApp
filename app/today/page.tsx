import type { Metadata } from "next";
import Shell from "@/components/Shell";
import { allows } from "@/lib/access";
import { HABIT_COLUMNS, LOG_COLUMNS, type Habit, type HabitLog } from "@/lib/habits";
import { hatchBase, oatcakesEarned, visitPet } from "@/lib/pet";
import { PLAN_COLUMNS, addDays, todayIn, type PlanItem } from "@/lib/plan";
import { dueOf, sortQueue } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import { loadStaffList } from "@/lib/staff";
import { LIST_COLUMNS, type ListTicket } from "@/lib/types";
import Today from "./Today";
import "./today.css";

export const metadata: Metadata = { title: "Today" };

// Today, the front door for the owner and employees: somewhere to get things out of your head,
// up to three things for today, today's habits, Pickle, and what's next at work. Everything else
// is a tap away; this page is only ever about now.
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  const { supabase, member, workspace, ctx, shell, viewing } = await requireMember(["designer", "staff"]);
  const today = todayIn();
  const employee = member.staff || member.role === "staff";
  const seesJobs = member.role === "designer" && (!member.staff || allows(member.access, "requests"));
  // A week back covers the weekly reset's look back; open things go back as far as they go.
  const weekAgo = addDays(today, -7);
  const [{ data: open }, { data: recent }, { data: habits }, { data: logs }, jobs, set, earned] = await Promise.all([
    supabase.from("plan_items").select(PLAN_COLUMNS).eq("owner", member.email).eq("gone", false).is("done_at", null).order("rank").limit(500).returns<PlanItem[]>(),
    supabase.from("plan_items").select(PLAN_COLUMNS).eq("owner", member.email).eq("gone", false).is("parent_id", null).gte("done_at", weekAgo).order("done_at", { ascending: false }).limit(200).returns<PlanItem[]>(),
    supabase.from("habits").select(HABIT_COLUMNS).eq("gone", false).order("rank").order("id").returns<Habit[]>(),
    // Enough history for goals counted over a few weeks.
    supabase.from("habit_logs").select(LOG_COLUMNS).eq("gone", false).gte("on_date", addDays(today, -62)).order("created_at").limit(5000).returns<HabitLog[]>(),
    seesJobs ? supabase.from("tickets").select(LIST_COLUMNS).returns<ListTicket[]>().then((r) => r.data ?? []) : Promise.resolve([] as ListTicket[]),
    employee ? loadStaffList(supabase, member.email, workspace.owner_name || "Your manager") : Promise.resolve(null),
    oatcakesEarned(supabase, member, ctx),
  ]);
  // Coming back counts toward Pickle's visit streak, as it does on Jobs.
  const pet = viewing ? null : await visitPet(supabase, earned, hatchBase(member, earned));
  const next = sortQueue(jobs, ctx).slice(0, 2).map((t) => ({ id: t.id, title: t.title || "Untitled", due: dueOf(t, ctx) }));
  const fromBoss = set ? set.daily.filter((t) => !t.done).length + set.todo.length : 0;
  const name = (member.full_name || "").split(" ")[0];

  return (
    <Shell {...shell}>
      <Today
        name={name}
        today={today}
        initial={open ?? []}
        doneLately={recent ?? []}
        habits={habits ?? []}
        logs={logs ?? []}
        pet={pet}
        next={next}
        jobsLabel={seesJobs ? "Work" : ""}
        fromBoss={fromBoss ? { count: fromBoss, name: workspace.owner_name || workspace.name } : null}
        readOnly={viewing}
        brain={Boolean(process.env.ANTHROPIC_API_KEY) && !viewing}
        startReset={reset === "1"}
      />
    </Shell>
  );
}
