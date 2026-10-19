import Link from "next/link";
import Shell from "@/components/Shell";
import { allows } from "@/lib/access";
import type { JobField } from "@/lib/fields";
import { requireMember } from "@/lib/session";
import JobCalculator, { type Finished, type Timing } from "./JobCalculator";

// The job time calculator: built into Apps for the studio. Pick a type and a size and it estimates
// how long the job will take from the workspace's own finished jobs, plus any past jobs typed in.
export default async function JobTimePage() {
  const { supabase, ctx, member, terms, shell, viewing, self, workspace } = await requireMember(["designer"], "requests");
  const [{ data: jobs }, { data: fields }, { data: timings }] = await Promise.all([
    supabase
      .from("tickets")
      .select("id, business_id, title, type, created_at, delivered_at, details")
      .not("delivered_at", "is", null)
      .order("delivered_at", { ascending: false })
      .limit(1500)
      .returns<Finished[]>(),
    supabase.from("job_fields").select("key, label, type_ids").eq("kind", "number").order("position").returns<Pick<JobField, "key" | "label" | "type_ids">[]>(),
    supabase.from("job_timings").select("id, ticket_id, type, size, days, skip, note, created_at").order("created_at", { ascending: false }).returns<Timing[]>(),
  ]);
  const canEdit = !viewing && allows(member.access, "requests", "edit");

  return (
    <Shell {...shell}>
      <p className="eyebrow"><Link href="/apps">Apps</Link></p>
      <h1 className="large app-title">Job time calculator</h1>
      <p className="sub">How long a {terms.job} will take, worked out from your own finished {terms.jobs} and any past ones you add.</p>
      <JobCalculator
        types={ctx.types.map((t) => ({ id: t.id, name: t.name, lead_days: t.lead_days }))}
        jobs={jobs ?? []}
        mineId={workspace.kind !== "solo" ? self?.id : undefined}
        fields={fields ?? []}
        timings={timings ?? []}
        canEdit={canEdit}
        canSetType={canEdit && allows(member.access, "settings", "edit")}
        ai={canEdit && !member.staff && Boolean(process.env.ANTHROPIC_API_KEY)}
        jobWord={terms.job}
      />
    </Shell>
  );
}
