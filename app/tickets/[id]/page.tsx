import BizBadge from "@/components/BizBadge";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import StatusChip from "@/components/StatusChip";
import { addNote, saveDetails, setPinned, setStatus } from "@/app/actions";
import FieldInput from "@/components/FieldInput";
import { appliesTo, groupFields, hasValue, showValue, valueOf, type JobField } from "@/lib/fields";
import { dueLabel, formatDate, isDone, money, startBy, startLabel } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import type { Note, Ticket, TicketFile } from "@/lib/types";
import DeleteTicket from "./DeleteTicket";
import Link from "next/link";
import { createDocument } from "@/app/documents/actions";
import { docName, gbp, STATUS_LABEL } from "@/lib/documents";
import { asDoc } from "@/lib/docs-server";

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  const { supabase, member, businesses, ctx, terms, workspace, shell, viewing } = await requireMember();
  const trade = workspace.kind === "trade";
  const { data: t } = await supabase.from("tickets").select("*").eq("id", id).maybeSingle<Ticket>();
  if (!t) notFound();

  const [{ data: notes }, { data: files }, { data: fields }, { data: docRows }] = await Promise.all([
    supabase.from("ticket_notes").select("*").eq("ticket_id", id).order("created_at").returns<Note[]>(),
    supabase.from("ticket_files").select("*").eq("ticket_id", id).order("created_at").returns<TicketFile[]>(),
    supabase.from("job_fields").select("*").order("position").order("id").returns<JobField[]>(),
    member.role === "designer"
      ? supabase.from("documents").select("*").eq("ticket_id", id).order("created_at")
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const docs = (docRows ?? []).map(asDoc);
  const signed = files?.length
    ? (await supabase.storage.from("inspiration").createSignedUrls(files.map((f) => f.path), 3600)).data ?? []
    : [];

  const biz = businesses.find((b) => b.id === t.business_id);
  const isDesigner = member.role === "designer";
  const canNote = member.role !== "manager";
  const sb = startLabel(startBy(t, ctx));
  const done = isDone(t, ctx);
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
        </div>
      </div>
    );
  };

  return (
    <Shell {...shell}>
      <div style={{ maxWidth: 720 }}>
        <p className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none", letterSpacing: 0 }}>
          <BizBadge biz={biz} size={22} />
          {biz?.name}
        </p>
        <h1 className="large">{t.title}</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <StatusChip status={t.status} ctx={ctx} />
          <span className={`chip pri-${t.priority}`} style={{ background: "var(--fill)" }}>{t.priority}</span>
          {!done && member.role !== "client" && <span className={`when ${sb.tone}`}>{sb.text}</span>}
          {t.pinned && <span className="when">📌 Pinned</span>}
        </div>

        {isDesigner && (
          <>
            <p className="eyebrow">Stage</p>
            <div className="seg stage-picker" role="group" aria-label="Set stage">
              {ctx.stages.map((s) => (
                <form key={s.key} action={setStatus.bind(null, t.id, s.key)} style={{ display: "contents" }}>
                  <button type="submit" aria-pressed={t.status === s.key}>{s.label}</button>
                </form>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <form action={setPinned.bind(null, t.id, !t.pinned)}>
                <button className="btn plain small" type="submit">{t.pinned ? "Unpin from top" : "Pin to top"}</button>
              </form>
              <DeleteTicket id={t.id} noun={terms.job} />
            </div>
          </>
        )}

        <p className="eyebrow">Details</p>
        <div className="group">
          {biz && <div className="row"><span className="k">{terms.Client}</span><div className="ctl">{biz.name}</div></div>}
          <div className="row"><span className="k">Type</span><div className="ctl">{t.type}</div></div>
          <div className="row"><span className="k">Needed by</span><div className="ctl">{formatDate(t.deadline)} <span className="when">({dueLabel(t.deadline)})</span></div></div>
          {groups[0] && !groups[0].title && groups[0].fields.map(show)}
          <div className="row"><span className="k">{trade ? "Added" : "Submitted"}</span><div className="ctl">{formatDate(t.created_at)}{t.requester_name && !shown.has("requester_name") ? ` by ${t.requester_name}` : ""}</div></div>
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

        {signed.length > 0 && (
          <>
            <p className="eyebrow">{filesField?.label ?? "Files"}</p>
            <div className="group">
              <div className="row stack">
                <div className="files">
                  {files!.map((f, i) =>
                    signed[i]?.signedUrl ? (
                      <a key={f.id} href={signed[i].signedUrl} target="_blank" rel="noreferrer">
                        {IMAGE.test(f.name) && <img src={signed[i].signedUrl} alt="" />}
                        {f.name}
                      </a>
                    ) : null
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {isDesigner && (
          <>
            <p className="eyebrow">Quotes &amp; invoices</p>
            {done && !docs.some((d) => d.kind === "invoice") && !viewing && (
              <form action={createDocument.bind(null, t.id, "invoice")} className="notice doc-nudge">
                <span>This {terms.job}&apos;s finished. Send the invoice?</span>
                <button className="btn small" type="submit">Create invoice</button>
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
                  <form action={createDocument.bind(null, t.id, "quote")}><button className="btn plain small" type="submit">+ New quote</button></form>
                  <form action={createDocument.bind(null, t.id, "invoice")}><button className="btn plain small" type="submit">+ New invoice</button></form>
                </div>
              )}
            </div>
          </>
        )}
        {isDesigner && !viewing && editable.length > 0 && (
          <details className="edit-details">
            <summary className="btn plain small">Edit details</summary>
            <form action={saveDetails.bind(null, t.id)}>
              <div className="group">
                {editable.map((f) => <FieldInput key={f.key} field={{ ...f, required: false }} value={valueOf(t, f)} idPrefix="edit-" />)}
              </div>
              <p className="foot"><button className="btn small" type="submit">Save details</button></p>
            </form>
          </details>
        )}

        {trade && biz && (biz.phone || biz.email || biz.address) && (
          <>
            <p className="eyebrow">{biz.name}</p>
            <div className="group">
              {biz.phone && <div className="row"><span className="k">Phone</span><div className="ctl"><a href={`tel:${biz.phone}`}>{biz.phone}</a></div></div>}
              {biz.email && <div className="row"><span className="k">Email</span><div className="ctl"><a href={`mailto:${biz.email}`}>{biz.email}</a></div></div>}
              {biz.address && <div className="row"><span className="k">Address</span><div className="ctl">{biz.address}</div></div>}
            </div>
          </>
        )}

        <p className="eyebrow">Notes</p>
        <div className="group">
          {(notes ?? []).map((n) => (
            <div className="row stack" key={n.id}>
              <span className="k">{n.author_name || n.author_email} · {formatDate(n.created_at)}</span>
              <div className="copy">{n.body}</div>
            </div>
          ))}
          {!notes?.length && !canNote && <div className="empty">No notes yet.</div>}
          {canNote && (
            <form action={addNote.bind(null, t.id)} className="row">
              <div className="ctl">
                <input name="body" required aria-label="Note" placeholder={trade ? "Add a note…" : isDesigner ? "Message the client…" : `Reply to ${owner}…`} />
              </div>
              <button className="link" type="submit">Send</button>
            </form>
          )}
        </div>
      </div>
    </Shell>
  );
}
