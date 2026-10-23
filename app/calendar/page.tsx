import Shell from "@/components/Shell";
import { allows } from "@/lib/access";
import { TIME_COLUMNS, type TimeLog } from "@/lib/hours";
import { PLAN_COLUMNS, todayIn, type PlanItem } from "@/lib/plan";
import { readRoutine } from "@/lib/routine";
import { requireMember } from "@/lib/session";
import { loadStaffList } from "@/lib/staff";
import StaffList from "@/app/tasks/StaffList";
import Planner from "./Planner";

// To-do, the one place for to-dos: a list in priority order on one side, and the month it fills on
// the other. The owner sees everyone's; an employee sees their own, with the tasks the owner set
// them on Team at the top.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ item?: string; job?: string; m?: string; task?: string; dump?: string }> }) {
  const { item, job, m, task, dump } = await searchParams;
  const { supabase, member, workspace, shell, viewing, routine } = await requireMember(["designer", "staff"]);
  const employee = member.role === "staff";
  const owner = member.role === "designer" && !member.staff;
  const seesJobs = member.role === "designer" || allows(member.access, "requests");
  const seesTeam = owner || allows(member.access, "team");
  // Finished things drop off after a couple of months, so the page stays quick.
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const [{ data: rows }, { data: jobs }, { data: people }, { data: timeRows }, set] = await Promise.all([
    supabase.from("plan_items").select(PLAN_COLUMNS).eq("gone", false).or(`done_at.is.null,done_at.gt.${since}`).order("rank").returns<PlanItem[]>(),
    seesJobs
      ? supabase.from("tickets").select("id, title, delivered_at").order("updated_at", { ascending: false }).limit(300).returns<{ id: number; title: string; delivered_at: string | null }[]>()
      : Promise.resolve({ data: [] as { id: number; title: string; delivered_at: string | null }[] }),
    seesTeam
      ? supabase.from("members").select("email, full_name, role").in("role", ["designer", "staff"]).returns<{ email: string; full_name: string; role: string }[]>()
      : Promise.resolve({ data: [] as { email: string; full_name: string; role: string }[] }),
    // Hours logged on to-dos, and any timer that's running.
    supabase.from("time_logs").select(TIME_COLUMNS).eq("gone", false).or("plan_item_id.not.is.null,minutes.is.null").limit(3000).returns<TimeLog[]>(),
    employee ? loadStaffList(supabase, member.email, workspace.owner_name || "Your manager") : Promise.resolve(null),
  ]);
  const setBy = workspace.owner_name || workspace.name;
  const hasSet = set && set.daily.length + set.waiting.length + set.todo.length + set.done.length > 0;
  const items = rows ?? [];
  // Jobs still on the go to link to, plus any finished ones something here is already linked to.
  const linked = new Set(items.map((i) => i.ticket_id));
  const jobList = (jobs ?? []).filter((j) => !j.delivered_at || linked.has(j.id)).map(({ id, title }) => ({ id, title }));
  // Whose things to show: yours first, then each employee. Other owner logins only appear once
  // something is on their list, so a spare login doesn't show up as a second "you".
  const owners = new Set(items.map((i) => i.owner));
  const team = (people ?? [])
    .filter((p) => p.email === member.email || p.role === "staff" || owners.has(p.email))
    .sort((a, b) => Number(b.email === member.email) - Number(a.email === member.email) || (a.full_name || a.email).localeCompare(b.full_name || b.email))
    .map((p) => ({ email: p.email, name: p.full_name || p.email.split("@")[0], owner: p.role === "designer" }));
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
        routine={readRoutine(routine)}
        brain={Boolean(process.env.ANTHROPIC_API_KEY) && !viewing}
        focusDump={dump === "1"}
        top={set && hasSet ? (
          <section className="staff-list todo-set" aria-label={`From ${setBy}`}>
            <h2 className="todo-set-title">From {setBy}</h2>
            <StaffList list={set} assignee={member.email} me={member.email} owner={false} open={Number(task) || undefined} adding={false} />
          </section>
        ) : undefined}
      />
    </Shell>
  );
}
