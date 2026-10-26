import SendCustomerLink from "@/components/SendCustomerLink";
import BizBadge from "@/components/BizBadge";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import StatusChip from "@/components/StatusChip";
import { addNote, saveDetails, setPinned, setStatus } from "@/app/actions";
import FieldInput from "@/components/FieldInput";
import { appliesTo, groupFields, hasValue, itemsOf, showValue, valueOf, type JobField } from "@/lib/fields";
import { PRIORITIES, dueOf, finalStage, formatDate, isDone, money, reviewStage, startBy, startLabel, statusLabel, todayISO, whenLabel } from "@/lib/priority";
import { asClient, requireMember } from "@/lib/session";
import { coreFields, type CoreKey } from "@/lib/core-fields";
import { createClient } from "@/lib/supabase/server";
import { isSelf, MY_BUSINESS } from "@/lib/workspace";
import type { Note, Ticket, TicketFile } from "@/lib/types";
import DeleteTicket from "./DeleteTicket";
import AddFiles from "./AddFiles";
import NewDraft from "./NewDraft";
import KeptUpdated from "./KeptUpdated";
import DraftActions from "./DraftActions";
import ApproveDraft from "./ApproveDraft";
import Link from "next/link";
import { createDocument } from "@/app/documents/actions";
import { docName, gbp, round2, STATUS_LABEL } from "@/lib/documents";
import { asDoc } from "@/lib/docs-server";
import Deliveries from "@/components/Deliveries";
import Thumb from "@/components/Thumb";
import FileMenu from "@/components/FileMenu";
import { signDeliveries, type Delivery, type Draft, type DraftFile } from "@/lib/deliveries";
import SaveForm from "@/components/SaveForm";
import Submit from "@/components/Submit";
import FrameChanged from "@/components/FrameChanged";
import { Suspense } from "react";
import JumpTo from "./JumpTo";
import { signedUrls } from "@/lib/signed";
import JobHours from "@/components/JobHours";
import { TIME_COLUMNS, type TimeLog } from "@/lib/hours";

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;

type TicketEvent = { id: number; kind: "stage" | "review" | "finished" | "draft"; stage: string; draft_id: number | null; files: string[]; told: string[]; actor: string; created_at: string };
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: process.env.NEXT_PUBLIC_TIMEZONE || "Europe/London" });
const at = (iso: string) => `${formatDate(iso)}, ${TIME.format(new Date(iso))}`;
const fileList = (names: string[]) => (names.length > 6 ? `${names.slice(0, 6).join(", ")} and ${names.length - 6} more` : names.join(", "));

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  // Everything that only needs the job's number loads at once, alongside the session.
  const db = await createClient();
  const [session, { data: t }, { data: notes }, { data: files }, { data: fields }, { data: docRows }, { data: deliveryRows }, { data: draftRows }, { data: draftFileRows }, { data: events }, { data: timeRows }, { data: people }] = await Promise.all([
    requireMember(undefined, "requests"),
    db.from("tickets").select("*").eq("id", id).maybeSingle<Ticket>(),
    db.from("ticket_notes").select("*").eq("ticket_id", id).order("created_at").returns<Note[]>(),
    db.from("ticket_files").select("*").eq("ticket_id", id).order("created_at").returns<TicketFile[]>(),
    db.from("job_fields").select("*").order("position").order("id").returns<JobField[]>(),
    db.from("documents").select("*").eq("ticket_id", id).order("created_at"),
    db.from("ticket_deliveries").select("*").eq("ticket_id", id).order("created_at").returns<Delivery[]>(),
    db.from("ticket_drafts").select("*").eq("ticket_id", id).order("created_at").returns<Draft[]>(),
    db.from("ticket_draft_files").select("*, ticket_drafts!inner(ticket_id)").eq("ticket_drafts.ticket_id", id).order("created_at").returns<DraftFile[]>(),
    db.from("ticket_events").select("*").eq("ticket_id", id).order("created_at").returns<TicketEvent[]>(),
    // Hours worked on it, from here or the calendar. Clients see none (the database keeps them out).
    db.from("time_logs").select(TIME_COLUMNS).eq("ticket_id", id).eq("gone", false).returns<TimeLog[]>(),
    db.from("members").select("email, full_name").in("role", ["designer", "staff"]).returns<{ email: string; full_name: string }[]>(),
  ]);
  if (!t) notFound();
  // While previewing a client, their own jobs show as they see them; anything else shows as usual.
  const { supabase, member, businesses, self, ctx, terms, workspace, shell, viewing } = asClient(session, t.business_id);
  // Type and needed-by use the names set in Settings > Job form.
  const core = coreFields(workspace.core_fields, { trade: false, solo: false });
  const coreLabel = (k: CoreKey) => core.find((c) => c.key === k)?.label ?? k;
  const due = dueOf(t, ctx);
  const trade = workspace.kind !== "studio";
  // The top-of-form fields as this workspace's new job form shows them, for Edit details.
  const top = coreFields(workspace.core_fields, { trade, solo: workspace.kind === "solo" });

  // Then what needs the job itself, also all at once.
  const [{ data: links }, [{ data: members }, { data: memberLinks }], delivered, draftFiles, signed] = await Promise.all([
    // The job this one follows on from, and any follow-ups sent from it.
    supabase.from("tickets").select("id, title, follows").or(`follows.eq.${id}${t.follows ? `,id.eq.${t.follows}` : ""}`).order("created_at").returns<Pick<Ticket, "id" | "title" | "follows">[]>(),
    // The business's clients and managers, for the studio to pick who's kept updated on this job.
    member.role === "designer" && !viewing && !trade
      ? Promise.all([
          supabase.from("members").select("email, full_name, role, business_id").in("role", ["client", "manager"]).returns<{ email: string; full_name: string; role: string; business_id: string | null }[]>(),
          supabase.from("member_businesses").select("email").eq("business_id", t.business_id).returns<{ email: string }[]>(),
        ])
      : [{ data: null }, { data: null }],
    signDeliveries(supabase, deliveryRows ?? []),
    signDeliveries(supabase, (draftFileRows ?? []).map(({ ticket_drafts: _, ...f }: DraftFile & { ticket_drafts?: unknown }) => f)),
    files?.length ? signedUrls(supabase, "inspiration", files.map((f) => f.path)).then((u) => files.map((f) => ({ signedUrl: u[f.path] ?? null }))) : [],
  ]);
  const followsFrom = (links ?? []).find((x) => x.id === t.follows);
  const linkedHere = new Set((memberLinks ?? []).map((l) => l.email));
  // The business's own clients and any manager (managers can see every job), then clients of other
  // businesses (picking one shows them just this job), apart from whoever sent it: they're told anyway.
  const bizName = new Map(businesses.map((b) => [b.id, b.name]));
  const keepable = (members ?? [])
    .filter((m) => m.email !== t.created_by)
    .map((m) => {
      const here = m.role === "manager" || m.business_id === t.business_id || linkedHere.has(m.email);
      return { email: m.email, name: m.full_name || m.email, manager: m.role === "manager", elsewhere: here ? undefined : (m.business_id && bizName.get(m.business_id)) || "another business" };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const sentBy = (members ?? []).find((m) => m.email === t.created_by);
  const followUps = (links ?? []).filter((x) => x.follows === id);
  const drafts = draftRows ?? [];
  const docs = member.role === "designer" ? (docRows ?? []).map(asDoc) : [];

  const biz = businesses.find((b) => b.id === t.business_id);
  // A job the workspace does for its own business: no customer to send, quote or invoice.
  const mine = workspace.kind !== "solo" && Boolean(self) && t.business_id === self?.id;
  const isDesigner = member.role === "designer";
  const done = isDone(t, ctx);
  // Clients keep adding notes after sending a request. A manager can on a request they sent, and
  // can reply on a finished job for a business they're linked to.
  const linked = (member.business_ids ?? []).includes(t.business_id);
  const canNote = member.role !== "manager" || t.created_by === member.email || t.tell.includes(member.email) || (done && linked && !viewing);
  // On a finished job, the client (or a linked manager) can ask for a follow-up request from here.
  const canFollowUp = done && !trade && !viewing && member.role !== "designer" && linked;
  // The studio and the client can add files after a job's sent (an invoice, a forgotten photo);
  // so can a manager, on a request they sent. Not a client it was only shared with.
  const canAddFiles = (member.role === "designer" || (member.role === "client" && linked) || t.created_by === member.email) && !viewing;
  const sb = dueOf(t, ctx) ? startLabel(startBy(t, ctx)) : null;
  const review = reviewStage(ctx);
  const owner = workspace.owner_name || "the studio";
  // Show every field that has something in it, even ones since hidden from the form, so nothing saved is lost.
  const typeId = ctx.types.find((x) => x.name === t.type)?.id;
  const withValues = (fields ?? []).filter((f) => f.kind === "heading" || hasValue(valueOf(t, f)));
  const groups = groupFields(withValues);
  const shown = new Set(withValues.map((f) => f.key));
  const filesField = fields?.find((f) => f.kind === "files");
  const editable = (fields ?? []).filter((f) => !f.hidden && f.kind !== "heading" && f.kind !== "files" && appliesTo(f, typeId));
  const fieldOn = (key: string) => fields?.some((f) => f.key === key && (!f.hidden || hasValue(valueOf(t, f))));
  const quote = fieldOn("quote_amount") && fieldOn("paid_amount") ? t.quote_amount : null;
  const paid = t.paid_amount;
  const show = (f: JobField) => {
    const v = showValue(f, valueOf(t, f));
    if (f.kind === "longtext")
      return (
        <div className="row stack" key={f.key}>
          <span className="k">{f.label}</span>
          <div className="copy">{v}</div>
        </div>
      );
    return (
      <div className="row" key={f.key}>
        <span className="k">{f.label}</span>
        <div className="ctl">
          {f.kind === "link" && /^https?:\/\//.test(v) ? <a href={v} target="_blank" rel="noreferrer">{v}</a>
            : f.kind === "phone" ? <a href={`tel:${v}`}>{v}</a>
            : f.kind === "email" ? <a href={`mailto:${v}`}>{v}</a>
            : v}
          {f.kind === "money" && itemsOf(t, f.key).map((it, i) => (
            <div className="when" key={i}>{it.qty !== 1 ? `${it.qty} × ` : ""}{it.description || "Item"} · {gbp(round2(it.qty * it.unit_price))}</div>
          ))}
        </div>
      </div>
    );
  };

  // Finished files sit near the top once there are some (or the job's done); until then the studio finds the upload lower down.
  const deliveriesUp = delivered.length > 0 || (isDesigner && done);
  const deliveries = (isDesigner || delivered.length > 0) && (
    <>
      <p className="eyebrow">Finished files</p>
      <Deliveries ticketId={t.id} businessId={t.business_id} files={delivered} canEdit={isDesigner && !viewing} canEmail={isDesigner && !viewing} clientName={biz?.name ?? `the ${terms.client}`} />
    </>
  );

  const jobNotes = (notes ?? []).filter((n) => !n.draft_id);
  const noteRow = (n: Note) => (
    <div className={`row stack${n.kind === "approval" ? " note-approval" : ""}`} key={n.id} data-at={n.created_at}>
      <span className="k">{n.author_name || n.author_email} · {formatDate(n.created_at)}</span>
      <div className="copy">{n.kind === "approval" ? "✓ Approved this draft" : n.body}</div>
    </div>
  );
  const noteForm = (placeholder: string, draftId?: number) => (
    <form action={addNote.bind(null, t.id)} className="row note-form">
      {draftId && <input type="hidden" name="draft" value={draftId} />}
      <div className="ctl">
        <textarea name="body" required aria-label="Note" placeholder={placeholder} />
      </div>
      <Submit className="link" type="submit">Send</Submit>
    </form>
  );

  // Drafts the studio shares for notes before the final files. They sit near the top while one's
  // waiting on notes, and below the files once the job's done. Newest first.
  const final = ctx.stages[ctx.stages.length - 1];
  const draftsUp = !done && drafts.some((d) => !d.final_at);
  const draftSection = (drafts.length > 0 || (isDesigner && !viewing && !trade)) && (
    <>
      <p className="eyebrow" id="drafts">Drafts</p>
      <div className="drafts">
        {isDesigner && !viewing && (
          <NewDraft ticketId={t.id} businessId={t.business_id} round={drafts.length + 1} clientName={biz?.name ?? `the ${terms.client}`} />
        )}
        {drafts.map((d, i) => ({ d, round: i + 1 })).reverse().map(({ d, round }) => {
          const said = (notes ?? []).filter((n) => n.draft_id === d.id);
          const approval = said.find((n) => n.kind === "approval");
          return (
            <section className="draft" key={d.id} aria-label={`Draft ${round}`} data-at={d.created_at}>
              <div className="draft-head">
                <b>Draft {round}</b>
                <span className="when">{formatDate(d.created_at)}</span>
                {d.final_at && <span className="chip draft-final">Sent as final</span>}
                {approval && <span className="chip draft-approved">Approved by {approval.author_name || approval.author_email}</span>}
              </div>
              {d.message && <div className="copy">{d.message}</div>}
              <Deliveries ticketId={t.id} businessId={t.business_id} files={draftFiles.filter((f) => f.draft_id === d.id)} canEdit={false} canEmail={isDesigner && !viewing} clientName="" />
              {(said.length > 0 || canNote) && (
                <div className="group">
                  {said.map(noteRow)}
                  {canNote && noteForm(isDesigner ? "Reply about this draft…" : "Leave notes on this draft…", d.id)}
                </div>
              )}
              {!isDesigner && canNote && !viewing && !d.final_at && !approval && (
                <ApproveDraft ticketId={t.id} draftId={d.id} round={round} owner={owner} />
              )}
              {isDesigner && !viewing && (
                <DraftActions ticketId={t.id} draftId={d.id} round={round} finalLabel={d.final_at ? "" : final?.label ?? "Done"} noun={terms.job} />
              )}
            </section>
          );
        })}
      </div>
    </>
  );

  return (
    <Shell {...shell}>
      <FrameChanged at={Date.now()} />
      <Suspense><JumpTo /></Suspense>
      <div style={{ maxWidth: 720 }}>
        {biz && (
          <p className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none", letterSpacing: 0 }}>
            <BizBadge biz={biz} size={22} />
            {biz.name}
          </p>
        )}
        {mine && <p className="eyebrow" style={{ textTransform: "none", letterSpacing: 0 }}>{MY_BUSINESS}</p>}
        <h1 className="large">{t.title}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <StatusChip status={t.status} ctx={ctx} />
          <span className={`chip pri-${t.priority}`} style={{ background: "var(--fill)" }}>{t.priority}</span>
          {mine && <span className="chip in-house">In-house</span>}
          {!done && sb && member.role !== "client" && <span className={`when ${sb.tone}`}>{sb.text}</span>}
          {t.pinned && <span className="when">📌 Pinned</span>}
        </div>
        {followsFrom && (
          <p className="when follow-link">Follows on from <Link href={`/tickets/${followsFrom.id}`}>{followsFrom.title}</Link></p>
        )}

        {canFollowUp && (
          <div className="notice follow-up">
            <span>Need changes or something more?</span>
            <span className="follow-up-actions">
              <a className="btn plain small" href="#notes">Reply with a note</a>
              <Link className="btn small" href={`/portal?follow=${t.id}`}>Ask for a follow-up</Link>
            </span>
          </div>
        )}

        {isDesigner && (
          <>
            {/* The two big moments, as plain buttons. Both tell the person who asked for it. */}
            {!done && (
              <div className="job-actions">
                {/* Sending for review is sharing a draft: the button opens the draft form. */}
                {!trade && !viewing ? (
                  <a className="btn plain" href="#send-review">Send for review</a>
                ) : (
                  review && t.status !== review.key && (
                    <form action={setStatus.bind(null, t.id, review.key)}>
                      <Submit className="btn plain" type="submit">Send for review</Submit>
                    </form>
                  )
                )}
                <form action={setStatus.bind(null, t.id, finalStage(ctx))}>
                  <Submit className="btn" type="submit">Mark finished</Submit>
                </form>
              </div>
            )}
            <p className="eyebrow">Stage</p>
            <div className="seg stage-picker" role="group" aria-label="Set stage">
              {ctx.stages.map((s) => (
                <form key={s.key} action={setStatus.bind(null, t.id, s.key)} style={{ display: "contents" }}>
                  <Submit type="submit" aria-pressed={t.status === s.key}>{s.label}</Submit>
                </form>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <form action={setPinned.bind(null, t.id, !t.pinned)}>
                <Submit className="btn plain small" type="submit">{t.pinned ? "Unpin from top" : "Pin to top"}</Submit>
              </form>
              {/* Break the job into dated steps on the calendar. */}
              <Link className="btn plain small" href={`/calendar?job=${t.id}`}>Plan on calendar</Link>
              {/* Show this job to someone else on Oatcake: picks them under "Also tell" below. */}
              {members && keepable.length > 0 && <a className="btn plain small" href="#also-tell">Share</a>}
            </div>
          </>
        )}

        {deliveriesUp && deliveries}
        {draftsUp && draftSection}

        <p className="eyebrow">Details</p>
        <div className="group">
          {biz && <div className="row"><span className="k">{terms.Client}</span><div className="ctl">{biz.name}</div></div>}
          {mine && <div className="row"><span className="k">{terms.Client}</span><div className="ctl">{MY_BUSINESS} <span className="when">(in-house)</span></div></div>}
          <div className="row"><span className="k">{coreLabel("type")}</span><div className="ctl">{t.type}</div></div>
          {due && <div className="row"><span className="k">{coreLabel("deadline")}</span><div className="ctl">{formatDate(due, true)} <span className="when">({whenLabel(due)})</span></div></div>}
          {groups[0] && !groups[0].title && groups[0].fields.map(show)}
          <div className="row"><span className="k">{trade && !t.details?.via_link ? "Added" : "Submitted"}</span><div className="ctl">{formatDate(t.created_at)}{t.requester_name && !shown.has("requester_name") ? ` by ${t.requester_name}` : ""}{t.details?.via_link ? " through your request link" : ""}</div></div>
          {members && keepable.length > 0 && (
            <div className="row" id="also-tell"><span className="k">Also tell</span><div className="ctl"><KeptUpdated ticketId={t.id} value={t.tell ?? []} people={keepable} sender={sentBy ? sentBy.full_name || sentBy.email : null} /></div></div>
          )}
          {quote != null && (
            <div className="row"><span className="k">Left to pay</span><div className="ctl">{money(Math.max(0, quote - (paid ?? 0)))}</div></div>
          )}
        </div>

        {groups.filter((g, i) => i > 0 || g.title).map((g, i) => (
          <div key={`${g.title}-${i}`}>
            <p className="eyebrow">{g.title}</p>
            <div className="group">{g.fields.map(show)}</div>
          </div>
        ))}

        {isDesigner && !viewing && (
          <details className="edit-details">
            <summary className="btn plain small">Edit details</summary>
            {/* Saving is the end of the edit, so it goes back to wherever you opened the job from. */}
            <SaveForm action={saveDetails.bind(null, t.id)} saved={`${terms.Job} saved`} then="back" fallback="/">
              <div className="group">
                {top.filter((c) => !c.hidden).map((c) => (
                  <div className="row" key={c.key}>
                    <label htmlFor={`edit-${c.key}`}>{c.label}</label>
                    <div className="ctl">
                      {c.key === "customer" ? (
                        <>
                          <input id="edit-customer" name="customer" required list="edit-customers" autoComplete="off" defaultValue={mine ? MY_BUSINESS : biz?.name ?? ""} placeholder={c.hint || undefined} />
                          <datalist id="edit-customers">
                            <option value={MY_BUSINESS} />
                            {businesses.filter((b) => !isSelf(b)).map((b) => <option key={b.id} value={b.name} />)}
                          </datalist>
                        </>
                      ) : c.key === "phone" ? (
                        <input id="edit-phone" name="phone" type="tel" defaultValue={biz?.phone ?? ""} placeholder={c.hint || undefined} />
                      ) : c.key === "email" ? (
                        <input id="edit-email" name="cust_email" type="email" defaultValue={biz?.email ?? ""} placeholder={c.hint || undefined} />
                      ) : c.key === "address" ? (
                        <input id="edit-address" name="cust_address" defaultValue={biz?.address ?? ""} placeholder={c.hint || undefined} />
                      ) : c.key === "title" ? (
                        <input id="edit-title" name="title" required defaultValue={t.title} />
                      ) : c.key === "type" ? (
                        <select id="edit-type" name="type" defaultValue={t.type}>
                          {!ctx.types.some((x) => x.name === t.type) && <option>{t.type}</option>}
                          {ctx.types.map((x) => <option key={x.id}>{x.name}</option>)}
                        </select>
                      ) : c.key === "deadline" ? (
                        <input id="edit-deadline" name="deadline" type="date" required={Boolean(t.deadline)} defaultValue={t.deadline?.slice(0, 10)} />
                      ) : (
                        <select id="edit-priority" name="priority" defaultValue={t.priority}>
                          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
                {editable.map((f) => <FieldInput key={f.key} field={{ ...f, required: false }} value={valueOf(t, f)} idPrefix="edit-" items={itemsOf(t, f.key)} itemise />)}
              </div>
              <p className="foot"><Submit className="btn small" type="submit">Save details</Submit></p>
            </SaveForm>
          </details>
        )}

        {(signed.length > 0 || canAddFiles) && (
          <>
            <p className="eyebrow" id="files">{filesField?.label ?? "Files"}</p>
            {signed.length > 0 && (
            <div className="group">
              <div className="row stack">
                <div className="files">
                  {files!.map((f, i) =>
                    signed[i]?.signedUrl ? (
                      <FileMenu
                        key={f.id}
                        ticketId={t.id}
                        canEmail={isDesigner && !viewing}
                        file={{ name: f.name, bucket: "inspiration", path: f.path, url: null, view: signed[i].signedUrl, download: null, image: IMAGE.test(f.name) }}
                      >
                        <a href={signed[i].signedUrl} target="_blank" rel="noreferrer">
                          {IMAGE.test(f.name) && <Thumb bucket="inspiration" path={f.path} full={signed[i].signedUrl} />}
                          {f.name}
                        </a>
                      </FileMenu>
                    ) : null
                  )}
                </div>
              </div>
            </div>
            )}
            {canAddFiles && <AddFiles ticketId={t.id} businessId={t.business_id} isClient={member.role !== "designer"} />}
          </>
        )}

        {!draftsUp && draftSection}
        {!deliveriesUp && deliveries}

        {isDesigner && (
          <>
            <p className="eyebrow" id="hours">Hours</p>
            <div className="group">
              <JobHours
                initial={timeRows ?? []}
                ticketId={t.id}
                me={session.member.email}
                names={Object.fromEntries((people ?? []).map((p) => [p.email, p.full_name || p.email]))}
                canEditAll={session.member.role === "designer" && !session.member.staff}
                readOnly={viewing || Boolean(shell.readOnly)}
                today={todayISO()}
              />
            </div>
          </>
        )}

        {isDesigner && (
          <>
            <p className="eyebrow">Quotes &amp; invoices</p>
            {done && !mine && !docs.some((d) => d.kind === "invoice") && !viewing && (
              <form action={createDocument.bind(null, t.id, "invoice")} className="notice doc-nudge">
                <span>This {terms.job}&apos;s finished. Send the invoice?</span>
                <Submit className="btn small" type="submit">Create invoice</Submit>
              </form>
            )}
            <div className="group">
              {docs.map((d) => (
                <Link key={d.id} href={`/documents/${d.id}`} className="row nav-row">
                  <div className="ctl">
                    <div style={{ fontWeight: 600 }}>{docName(d)}</div>
                    <div className="when">{gbp(d.total)}{d.sent_to ? ` · sent to ${d.sent_to}` : ""}</div>
                  </div>
                  <span className={`chip doc-status ${d.status}`}>{STATUS_LABEL[d.status]}</span>
                </Link>
              ))}
              {!viewing && (
                <div className="row doc-make">
                  <form action={createDocument.bind(null, t.id, "quote")}><Submit className="btn plain small" type="submit">+ New quote</Submit></form>
                  <form action={createDocument.bind(null, t.id, "invoice")}><Submit className="btn plain small" type="submit">+ New invoice</Submit></form>
                </div>
              )}
            </div>
          </>
        )}
        {trade && biz && (biz.phone || biz.email || biz.address) && (
          <>
            <p className="eyebrow">{biz.name}</p>
            <div className="group">
              {biz.phone && <div className="row"><span className="k">Phone</span><div className="ctl"><a href={`tel:${biz.phone}`}>{biz.phone}</a></div></div>}
              {biz.email && <div className="row"><span className="k">Email</span><div className="ctl"><a href={`mailto:${biz.email}`}>{biz.email}</a></div></div>}
              {biz.address && <div className="row"><span className="k">Address</span><div className="ctl">{biz.address}</div></div>}
              {workspace.kind === "trade" && biz.email && isDesigner && !viewing && <SendCustomerLink id={biz.id} name={biz.name} />}
            </div>
          </>
        )}

        {followUps.length > 0 && (
          <>
            <p className="eyebrow">Follow-ups</p>
            <div className="group">
              {followUps.map((f) => (
                <Link key={f.id} href={`/tickets/${f.id}`} className="row nav-row"><div className="ctl">{f.title}</div></Link>
              ))}
            </div>
          </>
        )}

        <p className="eyebrow" id="notes">Notes</p>
        <div className="group">
          {jobNotes.map(noteRow)}
          {!jobNotes.length && !canNote && <div className="empty">No notes yet.</div>}
          {canNote && noteForm(trade ? "Add a note…" : isDesigner ? "Message the client…" : member.role === "manager" && t.created_by !== member.email ? `Reply to ${owner}…` : `Add more to your request, or reply to ${owner}…`)}
        </div>

        {/* What's happened to the job so far: sent, drafts sent for review with their files, stage
            changes, finished. The studio also sees who was emailed each time. */}
        <p className="eyebrow">Progress</p>
        <ol className="timeline">
          <li>
            <b>{trade ? "Added" : isDesigner && t.created_by === member.email ? "Added by you" : `Sent${t.requester_name ? ` by ${t.requester_name}` : ""}`}</b>
            <span className="when">{at(t.created_at)}</span>
          </li>
          {(events ?? []).map((e) => {
            const round = e.draft_id ? drafts.findIndex((d) => d.id === e.draft_id) + 1 : 0;
            const title =
              e.kind === "draft" ? (round ? `Draft ${round} sent for review` : "A draft was sent for review")
              : e.kind === "review" ? "Sent for review"
              : e.kind === "finished" ? "Finished"
              : `Moved to ${statusLabel(ctx, e.stage)}`;
            const tells = e.kind !== "stage" && isDesigner && !trade;
            return (
              <li key={e.id} className={`ev-${e.kind}`}>
                <b>{title}</b>
                <span className="when">{at(e.created_at)}{isDesigner && e.actor ? ` · ${e.actor}` : ""}</span>
                {e.files.length > 0 && <div className="ev-files">{fileList(e.files)}</div>}
                {e.kind === "review" && !e.files.length && <div className="when">No files went with it. Send a draft to share files for review.</div>}
                {tells && (e.told.length
                  ? <div className="when">Emailed {e.told.join(" and ")}</div>
                  : <div className="when ev-nobody">Nobody was told: no one at {biz?.name ?? `the ${terms.client}`} is set to hear about this {terms.job}. Pick someone under Also tell.</div>)}
              </li>
            );
          })}
        </ol>

        {/* Out of the way at the bottom, so it's never tapped by mistake next to everyday buttons. */}
        {isDesigner && !viewing && <div className="danger-foot"><DeleteTicket id={t.id} noun={terms.job} /></div>}
      </div>
    </Shell>
  );
}
