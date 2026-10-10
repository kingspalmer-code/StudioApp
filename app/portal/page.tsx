import Link from "next/link";
import Shell from "@/components/Shell";
import TicketRow from "@/components/TicketRow";
import { coversFor } from "@/lib/deliveries";
import type { JobField } from "@/lib/fields";
import { formatDate, isDone } from "@/lib/priority";
import { requireEditor } from "@/lib/session";
import type { Ticket } from "@/lib/types";
import ClientRequests from "./ClientRequests";
import NewRequestForm from "./NewRequestForm";

export default async function PortalPage() {
  const { supabase, member, businesses, ctx, workspace, shell } = await requireEditor(["client", "designer"]);
  const trade = workspace.kind === "trade";
  const owner = workspace.owner_name || "the studio";
  const isDesigner = member.role === "designer";
  const myBiz = businesses.find((b) => b.id === member.business_id);
  const helper = Boolean(process.env.ANTHROPIC_API_KEY) && !trade;

  const { data: fields } = await supabase.from("job_fields").select("*").order("position").order("id").returns<JobField[]>();
  const formFields = (fields ?? []).filter((f) => !f.hidden && f.on_form);

  // The studio (or a trade) logging a job: just the form.
  if (isDesigner) {
    return (
      <Shell {...shell}>
        <h1 className="large">{trade ? "New job" : "New design request"}</h1>
        <p className="sub">
          {trade ? "Add a job as soon as it comes in. New customers are saved automatically." : "Log a request that came in by WhatsApp or email so it joins the queue."}{" "}
          <Link href="/settings/form">Change what this form asks</Link>
        </p>
        <div style={{ maxWidth: 640 }}>
          <NewRequestForm businesses={businesses} defaultName={member.full_name} isDesigner types={ctx.types} fields={formFields} trade={trade} ownerName={owner} helper={helper} />
        </div>
      </Shell>
    );
  }

  // A client: their own portal. New request, what's in progress, and what's been finished.
  const { data } = await supabase.from("tickets").select("*").order("deadline").returns<Ticket[]>();
  const all = data ?? [];
  const open = all.filter((t) => !isDone(t, ctx));
  const finished = all
    .filter((t) => isDone(t, ctx))
    .sort((a, b) => (b.delivered_at ?? b.deadline).localeCompare(a.delivered_at ?? a.deadline));
  const covers = await coversFor(supabase, finished.slice(0, 6).map((t) => t.id));

  return (
    <Shell {...shell}>
      <div className="portal">
        <h1 className="large">{myBiz ? `${myBiz.name} requests` : "Your requests"}</h1>
        <p className="sub">Send {owner} a new request, and see how each one is going.</p>

        <ClientRequests
          startOpen={all.length === 0}
          form={{ businesses: myBiz ? [myBiz] : [], defaultName: member.full_name, isDesigner: false, types: ctx.types, fields: formFields, trade, ownerName: owner, helper }}
        />

        <p className="eyebrow">In progress</p>
        <div className="group">
          {open.length ? (
            open.map((t) => <TicketRow key={t.id} t={t} biz={myBiz} ctx={ctx} showBusiness={false} />)
          ) : (
            <div className="empty">{all.length ? "Nothing in progress right now." : "No requests yet. Your first one will show here."}</div>
          )}
        </div>

        {finished.length > 0 && (
          <>
            <div className="eyebrow-row">
              <p className="eyebrow">Completed</p>
              <Link href="/portal/archive" className="eyebrow-link">See all {finished.length} ›</Link>
            </div>
            <div className="gallery">
              {finished.slice(0, 6).map((t) => (
                <Link key={t.id} href={`/tickets/${t.id}`} className="gallery-card">
                  <span className="gallery-img">
                    {covers[t.id]?.url ? <img src={covers[t.id]!.url!} alt="" loading="lazy" /> : <span>{t.type}</span>}
                  </span>
                  <b>{t.title}</b>
                  <small className="when">{formatDate(t.delivered_at ?? t.deadline)}{covers[t.id]?.count ? ` · ${covers[t.id]!.count} file${covers[t.id]!.count > 1 ? "s" : ""}` : ""}</small>
                </Link>
              ))}
            </div>
          </>
        )}

        <p className="foot portal-foot">
          <Link href="/portal/brand">Change your logo and colour</Link>
        </p>
      </div>
    </Shell>
  );
}
