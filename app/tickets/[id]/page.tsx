import BizBadge from "@/components/BizBadge";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import StatusChip from "@/components/StatusChip";
import { addNote, setPinned, setStatus, updateJob } from "@/app/actions";
import { dueLabel, formatDate, isDone, money, startBy, startLabel } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import type { Note, Ticket, TicketFile } from "@/lib/types";
import DeleteTicket from "./DeleteTicket";

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  const { supabase, member, businesses, ctx, terms, workspace, shell } = await requireMember();
  const trade = workspace.kind === "trade";
  const { data: t } = await supabase.from("tickets").select("*").eq("id", id).maybeSingle<Ticket>();
  if (!t) notFound();

  const [{ data: notes }, { data: files }] = await Promise.all([
    supabase.from("ticket_notes").select("*").eq("ticket_id", id).order("created_at").returns<Note[]>(),
    supabase.from("ticket_files").select("*").eq("ticket_id", id).order("created_at").returns<TicketFile[]>(),
  ]);
  const signed = files?.length
    ? (await supabase.storage.from("inspiration").createSignedUrls(files.map((f) => f.path), 3600)).data ?? []
    : [];

  const biz = businesses.find((b) => b.id === t.business_id);
  const isDesigner = member.role === "designer";
  const canNote = member.role !== "manager";
  const sb = startLabel(startBy(t, ctx));
  const done = isDone(t, ctx);
  const owner = workspace.owner_name || "the studio";
  const field = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="row stack">
        <span className="k">{label}</span>
        <div className="copy">{value}</div>
      </div>
    ) : null;

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

        {trade && (
          <>
            <p className="eyebrow">Quote and site</p>
            {isDesigner ? (
              <form action={updateJob.bind(null, t.id)}>
                <div className="group">
                  <div className="row">
                    <label htmlFor="quote_amount">Quote (£)</label>
                    <div className="ctl"><input id="quote_amount" name="quote_amount" inputMode="decimal" defaultValue={t.quote_amount ?? ""} placeholder="0" /></div>
                  </div>
                  <div className="row">
                    <label htmlFor="paid_amount">Paid (£)</label>
                    <div className="ctl"><input id="paid_amount" name="paid_amount" inputMode="decimal" defaultValue={t.paid_amount ?? ""} placeholder="0" /></div>
                  </div>
                  <div className="row">
                    <label htmlFor="site_address">Site address</label>
                    <div className="ctl"><input id="site_address" name="site_address" defaultValue={t.site_address} placeholder="Where the sign goes" /></div>
                  </div>
                </div>
                <p className="foot">
                  {t.quote_amount != null && `Left to pay: ${money(Math.max(0, t.quote_amount - (t.paid_amount ?? 0)))}. `}
                  <button className="link" type="submit">Save</button>
                </p>
              </form>
            ) : (
              <div className="group">
                <div className="row"><span className="k">Quote</span><div className="ctl">{money(t.quote_amount) || "Not set"}</div></div>
                <div className="row"><span className="k">Paid</span><div className="ctl">{money(t.paid_amount) || "Nothing yet"}</div></div>
                {t.site_address && <div className="row"><span className="k">Site</span><div className="ctl">{t.site_address}</div></div>}
              </div>
            )}
            {biz && (biz.phone || biz.email || biz.address) && (
              <>
                <p className="eyebrow">{biz.name}</p>
                <div className="group">
                  {biz.phone && <div className="row"><span className="k">Phone</span><div className="ctl"><a href={`tel:${biz.phone}`}>{biz.phone}</a></div></div>}
                  {biz.email && <div className="row"><span className="k">Email</span><div className="ctl"><a href={`mailto:${biz.email}`}>{biz.email}</a></div></div>}
                  {biz.address && <div className="row"><span className="k">Address</span><div className="ctl">{biz.address}</div></div>}
                </div>
              </>
            )}
          </>
        )}

        <p className="eyebrow">Details</p>
        <div className="group">
          <div className="row"><span className="k">Type</span><div className="ctl">{t.type}</div></div>
          {t.formats && <div className="row"><span className="k">Sizes</span><div className="ctl">{t.formats}</div></div>}
          <div className="row"><span className="k">Needed by</span><div className="ctl">{formatDate(t.deadline)} <span className="when">({dueLabel(t.deadline)})</span></div></div>
          {t.event_date && <div className="row"><span className="k">Event / go-live</span><div className="ctl">{formatDate(t.event_date)}</div></div>}
          {!trade && <div className="row"><span className="k">Requested by</span><div className="ctl">{t.requester_name || t.created_by}{t.approver ? ` · approver: ${t.approver}` : ""}</div></div>}
          <div className="row"><span className="k">{trade ? "Added" : "Submitted"}</span><div className="ctl">{formatDate(t.created_at)}</div></div>
        </div>

        <p className="eyebrow">{trade ? "Job notes" : "Brief"}</p>
        <div className="group">
          {field(trade ? "What's needed" : "What they need", t.brief) ?? <div className="empty">{trade ? "No notes yet." : "No brief given."}</div>}
          {field("Copy", t.copy)}
        </div>

        {(t.links || t.colours || signed.length > 0) && (
          <>
            <p className="eyebrow">{trade ? "Photos and files" : "Inspiration"}</p>
            <div className="group">
              {field("Links", t.links)}
              {field("Colours / mood", t.colours)}
              {signed.length > 0 && (
                <div className="row stack">
                  <span className="k">Files</span>
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
              )}
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
