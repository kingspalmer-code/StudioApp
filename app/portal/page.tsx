import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import TicketRow from "@/components/TicketRow";
import { coversFor } from "@/lib/deliveries";
import type { JobField } from "@/lib/fields";
import { formatDate, isDone } from "@/lib/priority";
import { asClient, requireEditor } from "@/lib/session";
import type { Ticket } from "@/lib/types";
import ClientRequests from "./ClientRequests";
import NewRequestForm from "./NewRequestForm";
import Walkthrough from "@/components/Walkthrough";
import { startPreview } from "@/app/actions";

export default async function PortalPage({ searchParams }: { searchParams: Promise<{ tour?: string; business?: string }> }) {
  const { tour, business } = await searchParams;
  const { supabase, member, businesses, ctx, workspace, shell } = asClient(await requireEditor(["client", "designer", "manager"]));
  const previewing = Boolean(shell.preview);
  const trade = workspace.kind === "trade";
  const owner = workspace.owner_name || "the studio";
  const isDesigner = member.role === "designer";
  const myBiz = businesses.find((b) => b.id === member.business_id);
  // A client can request work for more than one business; they pick which on the form.
  const myBizes = (member.business_ids ?? []).map((id) => businesses.find((b) => b.id === id)).filter((b) => b !== undefined);
  const several = myBizes.length > 1;
  const only = several ? myBizes.find((b) => b.id === business) : undefined;
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
        {!trade && businesses.length > 0 && (
          <form action={startPreview} className="preview-switch preview-start">
            <span className="when">See the request pages as a client sees them:</span>
            <select name="business" aria-label="Client to preview">
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button className="link" type="submit">Preview</button>
          </form>
        )}
        <div style={{ maxWidth: 640 }}>
          <NewRequestForm businesses={businesses} defaultName={member.full_name} isDesigner types={ctx.types} fields={formFields} trade={trade} ownerName={owner} helper={helper} />
        </div>
      </Shell>
    );
  }

  // A manager sending a request for one of the businesses they're linked to: just the form.
  if (member.role === "manager") {
    if (!myBizes.length) redirect("/overview");
    return (
      <Shell {...shell}>
        <h1 className="large">New request</h1>
        <p className="sub">Send {owner} a request. It joins the queue, and you can follow it in the overview.</p>
        <div style={{ maxWidth: 640 }}>
          <NewRequestForm businesses={myBizes} defaultName={member.full_name} isDesigner={false} types={ctx.types} fields={formFields} trade={trade} ownerName={owner} helper={helper} />
        </div>
      </Shell>
    );
  }

  // A client: their own portal. New request, what's in progress, and what's been finished.
  const ids = only ? [only.id] : myBizes.map((b) => b.id);
  const { data } = await supabase.from("tickets").select("*").in("business_id", ids).order("deadline").returns<Ticket[]>();
  const byId = Object.fromEntries(myBizes.map((b) => [b.id, b]));
  const all = data ?? [];
  const open = all.filter((t) => !isDone(t, ctx));
  const finished = all
    .filter((t) => isDone(t, ctx))
    .sort((a, b) => (b.delivered_at ?? b.deadline).localeCompare(a.delivered_at ?? a.deadline));
  const covers = await coversFor(supabase, finished.slice(0, 6).map((t) => t.id));

  return (
    <Shell {...shell}>
      <div className="portal">
        <h1 className="large">{only ? `${only.name} requests` : myBiz && !several ? `${myBiz.name} requests` : "Your requests"}</h1>
        <p className="sub">Send {owner} a new request, and see how each one is going.</p>
        {several && (
          <nav className="seg portal-businesses" aria-label="Business">
            <Link href="/portal" aria-current={!only ? "page" : undefined}>All</Link>
            {myBizes.map((b) => <Link key={b.id} href={`/portal?business=${b.id}`} aria-current={only?.id === b.id ? "page" : undefined}>{b.name}</Link>)}
          </nav>
        )}

        <ClientRequests
          startOpen={all.length === 0 || previewing}
          form={{ businesses: only ? [only, ...myBizes.filter((b) => b !== only)] : myBizes, defaultName: member.full_name, isDesigner: false, types: ctx.types, fields: formFields, trade, ownerName: owner, helper }}
        />

        <p className="eyebrow">In progress</p>
        <div className="group" data-tour="in-progress">
          {open.length ? (
            open.map((t) => <TicketRow key={t.id} t={t} biz={byId[t.business_id]} ctx={ctx} showBusiness={several && !only} />)
          ) : (
            <div className="empty">{all.length ? "Nothing in progress right now." : "No requests yet. Your first one will show here."}</div>
          )}
        </div>

        {finished.length > 0 && (
          <>
            <div className="eyebrow-row">
              <p className="eyebrow">Completed</p>
              <Link href={only ? `/portal/archive?business=${only.id}` : "/portal/archive"} className="eyebrow-link">See all {finished.length} ›</Link>
            </div>
            <div className="gallery" data-tour="completed">
              {finished.slice(0, 6).map((t) => (
                <Link key={t.id} href={`/tickets/${t.id}`} className="gallery-card">
                  <span className="gallery-img">
                    {covers[t.id]?.url ? <img src={covers[t.id]!.url!} alt="" loading="lazy" /> : <span>{t.type}</span>}
                  </span>
                  <b>{t.title}</b>
                  <small className="when">{several && !only ? `${byId[t.business_id]?.name} · ` : ""}{formatDate(t.delivered_at ?? t.deadline)}{covers[t.id]?.count ? ` · ${covers[t.id]!.count} file${covers[t.id]!.count > 1 ? "s" : ""}` : ""}</small>
                </Link>
              ))}
            </div>
          </>
        )}

        {!previewing && <Walkthrough force={tour === "1"} client={{ business: myBiz?.name ?? "", studio: owner }} />}

        <p className="foot portal-foot">
          <Link href={only ? `/portal/brand?business=${only.id}` : "/portal/brand"}>Change {only && several ? `${only.name}'s` : "your"} logo and colour</Link>
        </p>
      </div>
    </Shell>
  );
}
