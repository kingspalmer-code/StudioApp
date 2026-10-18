import Shell from "@/components/Shell";
import { allows } from "@/lib/access";
import { TIME_COLUMNS, type TimeLog } from "@/lib/hours";
import { PLAN_COLUMNS, todayIn, type PlanItem } from "@/lib/plan";
import { requireMember } from "@/lib/session";
import Planner from "./Planner";

// The calendar: a to-do list in priority order on one side, and the month it fills on the other.
// The owner sees everyone's; an employee sees their own.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ item?: string; job?: string; m?: string }> }) {
  const { item, job, m } = await searchParams;
  const { supabase, member, shell, viewing } = await requireMember(["designer", "staff"]);
  const owner = member.role === "designer" && !member.staff;
  const seesJobs = member.role === "designer" || allows(member.access, "requests");
  const seesTeam = owner || allows(member.access, "team");
  // Finished things drop off after a couple of months, so the page stays quick.
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const [{ data: rows }, { data: jobs }, { data: people }, { data: timeRows }] = await Promise.all([
    supabase.from("plan_items").select(PLAN_COLUMNS).eq("gone", false).or(`done_at.is.null,done_at.gt.${since}`).order("rank").returns<PlanItem[]>(),
    seesJobs
      ? supabase.from("tickets").select("id, title, delivered_at").order("updated_at", { ascending: false }).limit(300).returns<{ id: number; title: string; delivered_at: string | null }[]>()
      : Promise.resolve({ data: [] as { id: number; title: string; delivered_at: string | null }[] }),
    seesTeam
      ? supabase.from("members").select("email, full_name, role").in("role", ["designer", "staff"]).returns<{ email: string; full_name: string; role: string }[]>()
      : Promise.resolve({ data: [] as { email: string; full_name: string; role: string }[] }),
    // Hours logged on to-dos, and any timer that's running.
    supabase.from("time_logs").select(TIME_COLUMNS).eq("gone", false).or("plan_item_id.not.is.null,minutes.is.null").limit(3000).returns<TimeLog[]>(),
  ]);
  const items = rows ?? [];
  // Jobs still on the go to link to, plus any finished ones something here is already linked to.
  const linked = new Set(items.map((i) => i.ticket_id));
  const jobList = (jobs ?? []).filter((j) => !j.delivered_at || linked.has(j.id)).map(({ id, title }) => ({ id, title }));
  const team = (people ?? []).map((p) => ({ email: p.email, name: p.full_name || p.email, owner: p.role === "designer" }));
  const today = todayIn();
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : today.slice(0, 7);
  const jobId = Number(job) || undefined;

  return (
    <Shell {...shell}>
      <Planner
        initial={items}
        initialLogs={timeRows ?? []}
        jobs={jobList}
        team={team}
        me={member.email}
        today={today}
        startMonth={month}
        openId={Number(item) || undefined}
        newForJob={jobId ? jobList.find((j) => j.id === jobId) : undefined}
        readOnly={viewing}
      />
    </Shell>
  );
}
