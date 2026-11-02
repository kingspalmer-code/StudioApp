import Shell from "@/components/Shell";
import { allows } from "@/lib/access";
import { PAY_COLUMNS, type PayLog } from "@/lib/hours";
import { todayIn } from "@/lib/plan";
import { requireMember } from "@/lib/session";
import HoursBoard from "./HoursBoard";
import "./hours.css";

export const metadata = { title: "Hours" };

// Hours: everyone logs the time they work (a date, a job, the kind of work, the hours and their
// hourly rate) and sees it added up per person and per job, with the pay each is owed. The owner
// sees everyone and marks hours paid; an employee sees their own, or everyone's if they may look
// at Team (the database keeps to the same rule, migration 039).
export default async function HoursPage() {
  const { supabase, member, shell, viewing } = await requireMember(["designer", "staff"]);
  const owner = member.role === "designer" && !member.staff;
  const seesAll = owner || allows(member.access, "team");
  const canEditAll = owner || allows(member.access, "team", "edit");
  const [{ data: logs, error }, { data: jobs }, { data: people }] = await Promise.all([
    supabase.from("time_logs").select(PAY_COLUMNS).eq("gone", false).order("day", { ascending: false }).order("id", { ascending: false }).limit(5000).returns<PayLog[]>(),
    supabase.rpc("hour_jobs"),
    seesAll
      ? supabase.from("members").select("email, full_name").in("role", ["designer", "staff"]).returns<{ email: string; full_name: string }[]>()
      : Promise.resolve({ data: [] as { email: string; full_name: string }[] }),
  ]);
  const names: Record<string, string> = Object.fromEntries((people ?? []).map((p) => [p.email, p.full_name || p.email.split("@")[0]]));
  names[member.email] = member.full_name || member.email.split("@")[0];

  return (
    <Shell {...shell}>
      <HoursBoard
        initial={logs ?? []}
        jobs={((jobs as { id: number; title: string; delivered_at: string | null }[] | null) ?? []).map((j) => ({ id: j.id, title: j.title, done: Boolean(j.delivered_at) }))}
        names={names}
        me={member.email}
        owner={owner && !viewing}
        seesAll={seesAll}
        canEditAll={canEditAll && !viewing}
        readOnly={viewing}
        today={todayIn()}
        notReady={Boolean(error)}
      />
    </Shell>
  );
}
