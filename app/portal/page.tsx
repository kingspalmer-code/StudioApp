import Shell from "@/components/Shell";
import TicketRow from "@/components/TicketRow";
import { requireEditor } from "@/lib/session";
import { isDone } from "@/lib/priority";
import type { JobField } from "@/lib/fields";
import type { Ticket } from "@/lib/types";
import Link from "next/link";
import NewRequestForm from "./NewRequestForm";

export default async function PortalPage() {
  const { supabase, member, businesses, ctx, workspace, shell } = await requireEditor(["client", "designer"]);
  const trade = workspace.kind === "trade";
  const owner = workspace.owner_name || "the studio";
  const isDesigner = member.role === "designer";
  const myBiz = businesses.find((b) => b.id === member.business_id);

  const { data: fields } = await supabase.from("job_fields").select("*").order("position").order("id").returns<JobField[]>();
  let tickets: Ticket[] = [];
  if (!isDesigner) {
    const { data } = await supabase.from("tickets").select("*").order("deadline").returns<Ticket[]>();
    tickets = (data ?? []).sort((a, b) => Number(isDone(a, ctx)) - Number(isDone(b, ctx)));
  }

  return (
    <Shell {...shell}>
      <h1 className="large">{trade ? "New job" : "New design request"}</h1>
      <p className="sub">
        {trade
          ? "Add a job as soon as it comes in. New customers are saved automatically."
          : isDesigner
          ? "Log a request that came in by WhatsApp or email so it joins the queue."
          : `Tell ${owner} what ${myBiz?.name ?? "your business"} needs. The more you include now, the fewer back-and-forths later.`}
        {isDesigner && (
          <>
            {" "}
            <Link href="/settings/form">Change what this form asks</Link>
          </>
        )}
      </p>
      <div className={isDesigner ? "" : "cols"} style={isDesigner ? { maxWidth: 640 } : undefined}>
        <NewRequestForm
          businesses={isDesigner ? businesses : myBiz ? [myBiz] : []}
          defaultName={member.full_name}
          isDesigner={isDesigner}
          types={ctx.types}
          fields={(fields ?? []).filter((f) => !f.hidden && f.on_form)}
          trade={trade}
          ownerName={owner}
        />
        {!isDesigner && (
          <div>
            <p className="eyebrow">{myBiz?.name} requests</p>
            <div className="group">
              {tickets.length ? (
                tickets.map((t) => <TicketRow key={t.id} t={t} biz={myBiz} ctx={ctx} showBusiness={false} />)
              ) : (
                <div className="empty">No requests yet. Send your first one with the form.</div>
              )}
            </div>
            <p className="foot">Tap a request to see its status and any notes from {owner}.</p>
          </div>
        )}
      </div>
    </Shell>
  );
}
