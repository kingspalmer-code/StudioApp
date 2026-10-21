"use client";

import ConfirmButton from "@/components/ConfirmButton";
import NumberInput from "@/components/NumberInput";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteDocument, draftItems, saveDocument, sendDocument, setDocStatus, type DocDraft } from "@/app/documents/actions";
import PdfSheet, { type PdfRequest } from "@/components/PdfSheet";
import { docName, gbp, round2, totals, type Doc, type LineItem } from "@/lib/documents";

export default function DocEditor({
  doc,
  vatRegistered,
  vatRate,
  ai,
  email,
  readOnly,
}: {
  doc: Doc;
  vatRegistered: boolean;
  vatRate: number;
  ai: boolean;
  email: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const quote = doc.kind === "quote";
  const [d, setD] = useState<DocDraft>({
    customer_name: doc.customer_name,
    customer_email: doc.customer_email,
    customer_address: doc.customer_address,
    title: doc.title,
    items: doc.items.length ? doc.items : [{ description: "", qty: 1, unit_price: 0 }],
    notes: doc.notes,
    issued_on: doc.issued_on,
    due_on: doc.due_on,
    vat: doc.vat_rate != null,
  });
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const [drafting, setDrafting] = useState(false);
  const [extra, setExtra] = useState("");
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState(doc.customer_email);
  const [note, setNote] = useState(
    quote
      ? `Hi${doc.customer_name ? ` ${doc.customer_name}` : ""},\n\nHere's the quote for ${doc.title || "the job"}. Let me know if you have any questions or you're happy to go ahead.\n\nThanks`
      : `Hi${doc.customer_name ? ` ${doc.customer_name}` : ""},\n\nHere's the invoice for ${doc.title || "the job"}. Payment details are on the PDF.\n\nThanks`
  );

  const rate = d.vat ? (doc.vat_rate ?? vatRate) : null;
  const t = totals(d.items, rate);
  const set = <K extends keyof DocDraft>(k: K, v: DocDraft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };
  const setItem = (i: number, v: Partial<LineItem>) => set("items", d.items.map((x, j) => (j === i ? { ...x, ...v } : x)));

  async function save() {
    const res = await saveDocument(doc.id, d);
    if (res.error) {
      setMsg({ text: res.error, bad: true });
      return false;
    }
    setDirty(false);
    return true;
  }

  const [preview, setPreview] = useState<PdfRequest | null>(null);
  const openPdf = () =>
    start(async () => {
      if (dirty && !(await save())) return;
      setPreview({ url: `/documents/${doc.id}/pdf?t=${Date.now()}`, filename: `${docName(doc)}${d.customer_name ? ` - ${d.customer_name}` : ""}.pdf`.replace(/[^\w .,&()-]/g, "") });
    });

  async function draft() {
    setDrafting(true);
    setMsg(null);
    const res = await draftItems(doc.id, extra);
    setDrafting(false);
    if (res.error || !res.items) return setMsg({ text: res.error ?? "Something went wrong.", bad: true });
    setD((x) => ({ ...x, items: res.items!, notes: x.notes || res.notes || "" }));
    setDirty(true);
    setMsg({ text: "Drafted. Check the prices, then save." });
  }

  function send() {
    start(async () => {
      if (dirty && !(await save())) return;
      const res = await sendDocument(doc.id, to, note);
      if (res.error) return setMsg({ text: res.error, bad: true });
      setSending(false);
      setMsg(res.note ? { text: `Sent to ${to}. ${res.note}`, bad: true } : { text: res.via ? `Sent to ${to} from ${res.via}.` : `Sent to ${to}.` });
      router.refresh();
    });
  }

  return (
    <>
      <fieldset disabled={readOnly || pending} className="doc-editor">
        <p className="eyebrow">{quote ? "Prepared for" : "Bill to"}</p>
        <div className="group">
          <div className="row"><label htmlFor="cn">Name</label><div className="ctl"><input id="cn" value={d.customer_name} onChange={(e) => set("customer_name", e.target.value)} placeholder="Customer or business name" /></div></div>
          <div className="row"><label htmlFor="ce">Email</label><div className="ctl"><input id="ce" type="email" value={d.customer_email} onChange={(e) => { set("customer_email", e.target.value); setTo(e.target.value); }} placeholder="Where to send it" /></div></div>
          <div className="row"><label htmlFor="ca">Address</label><div className="ctl"><input id="ca" value={d.customer_address} onChange={(e) => set("customer_address", e.target.value)} placeholder="Optional" /></div></div>
        </div>

        <p className="eyebrow">What it&apos;s for</p>
        <div className="group">
          <div className="row"><label htmlFor="ti">Title</label><div className="ctl"><input id="ti" value={d.title} onChange={(e) => set("title", e.target.value)} /></div></div>
          <div className="row"><label htmlFor="is">Date</label><div className="ctl"><input id="is" type="date" value={d.issued_on} onChange={(e) => set("issued_on", e.target.value)} /></div></div>
          <div className="row"><label htmlFor="du">{quote ? "Valid until" : "Payment due"}</label><div className="ctl"><input id="du" type="date" value={d.due_on ?? ""} onChange={(e) => set("due_on", e.target.value || null)} /></div></div>
        </div>

        <div className="doc-items-head">
          <p className="eyebrow">Line items</p>
          {ai && !readOnly && (
            <div className="doc-ai">
              <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Anything to include? e.g. two site visits" aria-label="Notes for Oatcake's draft" />
              <button type="button" className="btn small" onClick={draft} disabled={drafting}>{drafting ? "Drafting…" : "✨ Draft with Oatcake"}</button>
            </div>
          )}
        </div>
        <div className="group doc-items">
          <div className="row doc-item head" aria-hidden="true">
            <span className="desc">Description</span><span className="qty">Qty</span><span className="price">Price</span><span className="amt">Amount</span><span className="x" />
          </div>
          {d.items.map((it, i) => (
            <div className="row doc-item" key={i}>
              <input className="desc" aria-label={`Item ${i + 1}`} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="What it's for" />
              <NumberInput className="qty" aria-label="Quantity" min={0} step="any" value={it.qty} onValue={(qty) => setItem(i, { qty })} />
              <NumberInput className="price" aria-label="Price (£)" step="0.01" value={it.unit_price} onValue={(unit_price) => setItem(i, { unit_price })} />
              <span className="amt">{gbp(round2((it.qty || 0) * (it.unit_price || 0)))}</span>
              <button type="button" className="x" aria-label="Remove line" onClick={() => set("items", d.items.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <div className="row">
            <button type="button" className="link" onClick={() => set("items", [...d.items, { description: "", qty: 1, unit_price: 0 }])}>+ Add a line</button>
          </div>
        </div>

        <div className="group doc-totals">
          {vatRegistered && (
            <label className="row">
              <span className="k">Add VAT at {doc.vat_rate ?? vatRate}%</span>
              <div className="ctl" style={{ textAlign: "right" }}><input type="checkbox" checked={d.vat} onChange={(e) => set("vat", e.target.checked)} /></div>
            </label>
          )}
          {rate != null && (
            <>
              <div className="row"><span className="k">Subtotal</span><div className="ctl num">{gbp(t.subtotal)}</div></div>
              <div className="row"><span className="k">VAT</span><div className="ctl num">{gbp(t.vat)}</div></div>
            </>
          )}
          <div className="row total"><span className="k">{quote ? "Total" : "Amount due"}</span><div className="ctl num">{gbp(t.total)}</div></div>
        </div>

        <p className="eyebrow">Notes</p>
        <div className="group">
          <div className="row stack">
            <textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder={quote ? "What's included, timings, anything else" : "Thanks for your business"} rows={3} aria-label="Notes" />
          </div>
        </div>

        {msg && <p className={msg.bad ? "error" : "foot"}>{msg.text}</p>}

        {!readOnly && (
          <>
            <div className="doc-actions">
              <button type="button" className="btn" onClick={() => start(async () => { if (await save()) setMsg({ text: "Saved." }); })} disabled={!dirty}>
                {dirty ? "Save" : "Saved"}
              </button>
              <button type="button" className="btn plain" onClick={openPdf}>Preview PDF</button>
              {email && <button type="button" className="btn plain" onClick={() => setSending((s) => !s)}>Email to customer</button>}
            </div>

            {sending && (
              <div className="group doc-send">
                <div className="row"><label htmlFor="to">To</label><div className="ctl"><input id="to" type="email" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
                <div className="row stack"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={6} aria-label="Message" /></div>
                <div className="row">
                  <span className="when">The PDF is attached. Replies come back to you.</span>
                  <button type="button" className="btn small" onClick={send}>Send</button>
                </div>
              </div>
            )}

            <div className="doc-actions secondary">
              {quote && doc.status !== "accepted" && (
                <button type="button" className="btn plain small" onClick={() => start(() => setDocStatus(doc.id, "accepted"))}>Mark accepted</button>
              )}
              {!quote && doc.status !== "paid" && (
                <button type="button" className="btn plain small" onClick={() => start(() => setDocStatus(doc.id, "paid"))}>Mark paid</button>
              )}
              <ConfirmButton
                label="Delete"
                className="btn danger small"
                ask={`Delete this ${quote ? "quote" : "invoice"}?`}
                yes="Delete"
                onConfirm={() => start(() => deleteDocument(doc.id))}
              />
            </div>
          </>
        )}
      </fieldset>
      <PdfSheet
        request={preview}
        title={docName(doc)}
        onClose={() => setPreview(null)}
        actions={
          email && !readOnly ? (
            <button type="button" className="btn" onClick={() => { setPreview(null); setSending(true); }}>Email to customer</button>
          ) : null
        }
      />
    </>
  );
}
