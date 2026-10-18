import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import TicketRow from "@/components/TicketRow";
import { coversFor } from "@/lib/deliveries";
import type { JobField } from "@/lib/fields";
import { coreFields } from "@/lib/core-fields";
import { formatDate, isDone } from "@/lib/priority";
import { asClient, requireEditor } from "@/lib/session";
import { LIST_COLUMNS, type ListTicket } from "@/lib/types";
import type { Ticket } from "@/lib/types";
import ClientRequests from "./ClientRequests";
import NewRequestForm from "./NewRequestForm";
import Walkthrough from "@/components/Walkthrough";
import { startPreview } from "@/app/actions";
import Submit from "@/components/Submit";

export default async function PortalPage({ searchParams }: { searchParams: Promise<{ tour?: string; business?: string; follow?: string; new?: string }> }) {
  const { tour, business, follow, new: fresh } = await searchParams;
  const { supabase, member, businesses, self, ctx, workspace, shell, terms } = asClient(await requireEditor(["client", "designer", "manager"]));
  const previewing = Boolean(shell.preview);
  const trade = workspace.kind !== "studio";
  const solo = workspace.kind === "solo";
  const owner = workspace.owner_name || "the studio";
  const isDesigner = member.role === "designer";
  const myBiz = businesses.find((b) => b.id === member.business_id);
  // A client can request work for more than one business; they pick which on the form.
  const myBizes = (member.business_ids ?? []).map((id) => businesses.find((b) => b.id === id)).filter((b) => b !== undefined);
  const several = myBizes.length > 1;
  const only = several ? myBizes.find((b) => b.id === business) : undefined;
  const helper = Boolean(process.env.ANTHROPIC_API_KEY) && !trade;

  // The form's fields, the job a follow-up starts from and a client's own requests all load at once.
  const ids = only ? [only.id] : myBizes.map((b) => b.id);
  const [{ data: fields }, { data: from }, { data }] = await Promise.all([
    supabase.from("job_fields").select("*").order("position").order("id").returns<JobField[]>(),
    follow && !isDesigner
      ? supabase.from("tickets").select("id, title, type, business_id, status, delivered_at").eq("id", Number(follow)).maybeSingle<Pick<Ticket, "id" | "title" | "type" | "business_id" | "status" | "delivered_at">>()
      : Promise.resolve({ data: null }),
    member.role === "client"
      ? supabase.from("tickets").select(LIST_COLUMNS).in("business_id", ids).order("deadline").returns<ListTicket[]>()
      : Promise.resolve({ data: null as Ticket[] | null }),
  ]);
  const formFields = (fields ?? []).filter((f) => !f.hidden && f.on_form);
  const core = coreFields(workspace.core_fields, { trade, solo });

  // "Ask for a follow-up" on a finished job: the form starts from that job's details.
  const followUp = from && myBizes.some((b) => b.id === from.business_id)
    ? {
        id: from.id,
        business_id: from.business_id,
        title: `Follow-up: ${from.title}`,
        type: from.type,
        brief: `Following on from "${from.title}"${from.delivered_at ? `, finished ${formatDate(from.delivered_at)}` : ""}.\n\n`,
      }
    : undefined;

  // The studio (or a trade) logging a job: just the form.
  if (isDesigner) {
    // Each business's clients and managers, so the studio can pick one to tell about the job.
    const [{ data: members }, { data: links }] = trade
      ? [{ data: [] }, { data: [] }]
      : await Promise.all([
          supabase.from("members").select("email, full_name, role, business_id").in("role", ["client", "manager"]).returns<{ email: string; full_name: string; role: string; business_id: string | null }[]>(),
          supabase.from("member_businesses").select("email, business_id").returns<{ email: string; business_id: string }[]>(),
        ]);
    const people = (members ?? [])
      .map((m) => ({
        email: m.email,
        name: m.full_name || m.email,
        manager: m.role === "manager",
        businesses: [m.business_id, ...(links ?? []).filter((l) => l.email === m.email).map((l) => l.business_id)].filter((b) => b !== null),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    // "?business=" starts the form on that business.
    const start = businesses.find((b) => b.id === business);
    const ordered = start ? [start, ...businesses.filter((b) => b !== start)] : businesses;
    return (
      <Shell {...shell}>
        <h1 className="large">{trade ? `New ${terms.job}` : "New design request"}</h1>
        <p className="sub">
          {solo
            ? "Add something you're working on. Oatcake tells you when to start it."
            : trade ? "Add a job as soon as it comes in. New customers are saved automatically." : "Log a request that came in by WhatsApp or email so it joins the queue."}{" "}
          <Link href="/settings/form">Change what this form asks</Link>
        </p>
        {!trade && businesses.length > 0 && (
          <form action={startPreview} className="preview-switch preview-start">
            <span className="when">See the request pages as a client sees them:</span>
            <select name="business" aria-label="Client to preview">
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <Submit className="link" type="submit">Preview</Submit>
          </form>
        )}
        <div style={{ maxWidth: 640 }}>
          <NewRequestForm businesses={ordered} defaultName={member.full_name} isDesigner types={ctx.types} fields={formFields} trade={trade} solo={solo} selfId={self?.id} ownerName={owner} helper={helper} people={people} core={core} />
        </div>
      </Shell>
    );
  }

  // A manager sending a request for one of the businesses they're linked to: just the form.
  if (member.role === "manager") {
    if (!myBizes.length) redirect("/overview");
    return (
      <Shell {...shell}>
        <h1 className="large">{followUp ? "Follow-up request" : "New request"}</h1>
        <p className="sub">{followUp ? `Ask ${owner} for more on "${from!.title}". It joins the queue as a new request, linked to the finished one.` : `Send ${owner} a request. It joins the queue, and you can follow it in the overview.`}</p>
        <div style={{ maxWidth: 640 }}>
          <NewRequestForm businesses={myBizes} defaultName={member.full_name} isDesigner={false} types={ctx.types} fields={formFields} trade={trade} ownerName={owner} helper={helper} followUp={followUp} core={core} />
        </div>
      </Shell>
    );
  }

  // A client: their own portal. New request, what's in progress, and what's been finished.
  const byId = Object.fromEntries(myBizes.map((b) => [b.id, b]));
  const all = data ?? [];
  const open = all.filter((t) => !isDone(t, ctx));
  const finished = all
    .filter((t) => isDone(t, ctx))
    .sort((a, b) => (b.delivered_at ?? b.deadline).localeCompare(a.delivered_at ?? a.deadline));
  const [covers, { data: draftRows }] = await Promise.all([
    coversFor(supabase, finished.slice(0, 6).map((t) => t.id)),
    open.length
      ? supabase.from("ticket_drafts").select("ticket_id, final_at").in("ticket_id", open.map((t) => t.id)).returns<{ ticket_id: number; final_at: string | null }[]>()
      : Promise.resolve({ data: [] }),
  ]);
  // Jobs with a draft shared for notes and not yet sent as final.
  const withDraft = new Set((draftRows ?? []).filter((d) => !d.final_at).map((d) => d.ticket_id));

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
          startOpen={all.length === 0 || previewing || Boolean(followUp) || fresh === "1"}
          form={{ followUp,  businesses: only ? [only, ...myBizes.filter((b) => b !== only)] : myBizes, defaultName: member.full_name, isDesigner: false, types: ctx.types, fields: formFields, trade, ownerName: owner, helper, core }}
        />

        <p className="eyebrow">In progress</p>
        <div className="group" data-tour="in-progress">
          {open.length ? (
            open.map((t) => <TicketRow key={t.id} t={t} biz={byId[t.business_id]} ctx={ctx} showBusiness={several && !only} draft={withDraft.has(t.id)} />)
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
