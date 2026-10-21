"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { saveDocSettings, setBrandFile } from "@/app/documents/actions";
import { CUSTOM_FONT, FONTS, docNumber, type DocSettings } from "@/lib/documents";
import { createClient } from "@/lib/supabase/client";
import PdfSheet, { type PdfRequest } from "@/components/PdfSheet";

const SWATCHES = ["#382a25", "#17110f", "#1f4e79", "#2f6f4f", "#9b2c2c", "#c2571a", "#6b3fa0", "#b8860b"];

export default function DocSettingsForm({
  settings,
  logoUrl,
  workspaceId,
  readOnly,
  used,
}: {
  settings: DocSettings;
  used: { invoice: number; quote: number };
  logoUrl: string | null;
  workspaceId: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [font, setFont] = useState(settings.font);
  const [accent, setAccent] = useState(settings.accent);
  const [vat, setVat] = useState(settings.vat_registered);
  const [nextInvoice, setNextInvoice] = useState(String(settings.next_invoice));
  const [nextQuote, setNextQuote] = useState(String(settings.next_quote));
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [uploading, setUploading] = useState<"logo" | "font" | null>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<PdfRequest | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function upload(kind: "logo" | "font", file: File | undefined) {
    if (!file) return;
    const ok = kind === "logo" ? /\.(png|jpe?g)$/i.test(file.name) : /\.(ttf|otf|woff)$/i.test(file.name);
    if (!ok) return setMsg({ text: kind === "logo" ? "Use a PNG or JPG for your logo." : "Use a .ttf, .otf or .woff font file.", bad: true });
    if (file.size > 5 * 1024 * 1024) return setMsg({ text: "That file is over 5MB.", bad: true });
    setUploading(kind);
    setMsg(null);
    const path = `${workspaceId}/${kind}-${Date.now()}.${file.name.split(".").pop()!.toLowerCase()}`;
    const { error } = await createClient().storage.from("brand").upload(path, file, { upsert: true });
    if (error) {
      setUploading(null);
      return setMsg({ text: `That didn't upload: ${error.message}`, bad: true });
    }
    await setBrandFile(kind, path);
    if (kind === "font") setFont(CUSTOM_FONT);
    setUploading(null);
    setMsg({ text: kind === "logo" ? "Logo saved." : "Font saved. Only upload fonts you're licensed to use in PDFs." });
    router.refresh();
  }

  return (
    <>
      <fieldset disabled={readOnly || pending} className="doc-settings">
        <p className="eyebrow">Logo</p>
        <div className="group">
          <div className="row logo-row">
            <div className="logo-box">{logoUrl ? <img src={logoUrl} alt="Your logo" /> : <span className="when">No logo yet</span>}</div>
            <div className="ctl">
              <label className="btn plain small file-btn">
                {uploading === "logo" ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
                <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => upload("logo", e.target.files?.[0])} />
              </label>
              {logoUrl && <button type="button" className="link" style={{ marginLeft: 12 }} onClick={() => start(async () => { await setBrandFile("logo", ""); router.refresh(); })}>Remove</button>}
              <div className="when" style={{ marginTop: 6 }}>PNG or JPG. A wide logo on a white or clear background works best.</div>
            </div>
          </div>
        </div>

        <form ref={formRef} action={(f) => start(async () => { try { await saveDocSettings(f); setMsg({ text: "Saved." }); router.refresh(); } catch (e) { setMsg({ text: (e as Error).message, bad: true }); } })}>
          <p className="eyebrow">Heading font</p>
          <div className="font-grid" role="radiogroup" aria-label="Heading font">
            {FONTS.map((f) => (
              <label key={f.key} className="font-tile" aria-checked={font === f.key}>
                <input type="radio" name="font" value={f.key} checked={font === f.key} onChange={() => setFont(f.key)} />
                <b style={{ fontFamily: f.css, color: accent }}>Quote</b>
                <span>{f.label}</span>
              </label>
            ))}
            {settings.font_path && (
              <label className="font-tile" aria-checked={font === CUSTOM_FONT}>
                <input type="radio" name="font" value={CUSTOM_FONT} checked={font === CUSTOM_FONT} onChange={() => setFont(CUSTOM_FONT)} />
                <b style={{ color: accent }}>Aa</b>
                <span>Your font</span>
              </label>
            )}
          </div>
          <p className="foot">
            <label className="link file-btn">
              {settings.font_path ? "Upload a different font" : "Upload your own font"}
              <input type="file" accept=".ttf,.otf,.woff" hidden onChange={(e) => upload("font", e.target.files?.[0])} />
            </label>{" "}
            (.ttf, .otf or .woff, and only one you&apos;re licensed to use in PDFs)
          </p>
          {uploading === "font" && <p className="foot">Uploading font…</p>}

          <p className="eyebrow">Colour</p>
          <div className="group">
            <div className="row swatch-row">
              {SWATCHES.map((c) => (
                <button key={c} type="button" className="swatch" aria-label={c} aria-pressed={accent.toLowerCase() === c} style={{ background: c }} onClick={() => setAccent(c)} />
              ))}
              <label className="swatch custom" aria-label="Pick any colour">
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
              </label>
              <input type="hidden" name="accent" value={accent} />
            </div>
          </div>

          <p className="eyebrow">Your details</p>
          <div className="group">
            <div className="row"><label htmlFor="bn">Business name</label><div className="ctl"><input id="bn" name="business_name" defaultValue={settings.business_name} required /></div></div>
            <div className="row"><label htmlFor="ad">Address</label><div className="ctl"><textarea id="ad" name="address" defaultValue={settings.address} rows={2} placeholder="Shown under your name" /></div></div>
            <div className="row"><label htmlFor="em">Email</label><div className="ctl"><input id="em" name="email" type="email" defaultValue={settings.email} placeholder="Customers reply to this" /></div></div>
            <div className="row"><label htmlFor="ph">Phone</label><div className="ctl"><input id="ph" name="phone" defaultValue={settings.phone} /></div></div>
            <div className="row"><label htmlFor="wb">Website</label><div className="ctl"><input id="wb" name="website" defaultValue={settings.website} /></div></div>
          </div>

          <p className="eyebrow">Money</p>
          <div className="group">
            <label className="row">
              <span className="k">VAT registered</span>
              <div className="ctl" style={{ textAlign: "right" }}><input type="checkbox" name="vat_registered" checked={vat} onChange={(e) => setVat(e.target.checked)} /></div>
            </label>
            {vat && (
              <>
                <div className="row"><label htmlFor="vn">VAT number</label><div className="ctl"><input id="vn" name="vat_number" defaultValue={settings.vat_number} /></div></div>
                <div className="row"><label htmlFor="vr">VAT rate (%)</label><div className="ctl"><input id="vr" name="vat_rate" type="number" step="0.5" min={0} max={100} defaultValue={settings.vat_rate} /></div></div>
              </>
            )}
            <div className="row"><label htmlFor="pd">Payment due</label><div className="ctl"><input id="pd" name="payment_days" type="number" min={0} max={365} defaultValue={settings.payment_days} /></div><span className="when">days after invoice</span></div>
            <div className="row"><label htmlFor="qd">Quotes valid</label><div className="ctl"><input id="qd" name="quote_days" type="number" min={0} max={365} defaultValue={settings.quote_days} /></div><span className="when">days</span></div>
            <div className="row"><label htmlFor="bk">Bank details</label><div className="ctl"><textarea id="bk" name="bank_details" defaultValue={settings.bank_details} rows={3} placeholder={"Account name, sort code and account number.\nShown on invoices only."} /></div></div>
            <div className="row"><label htmlFor="ft">Footer</label><div className="ctl"><input id="ft" name="footer" defaultValue={settings.footer} placeholder="e.g. Thank you for your business" /></div></div>
          </div>

          <p className="eyebrow">Numbering</p>
          <div className="group">
            <div className="row"><label htmlFor="ni">Next invoice</label><div className="ctl"><input id="ni" name="next_invoice" type="number" min={used.invoice + 1} max={9999999} step={1} value={nextInvoice} onChange={(e) => setNextInvoice(e.target.value)} /></div><span className="when">{docNumber({ kind: "invoice", number: Math.max(Number(nextInvoice) || 0, used.invoice + 1) })}</span></div>
            <div className="row"><label htmlFor="nq">Next quote</label><div className="ctl"><input id="nq" name="next_quote" type="number" min={used.quote + 1} max={9999999} step={1} value={nextQuote} onChange={(e) => setNextQuote(e.target.value)} /></div><span className="when">{docNumber({ kind: "quote", number: Math.max(Number(nextQuote) || 0, used.quote + 1) })}</span></div>
          </div>
          <p className="foot">
            Already numbering invoices somewhere else? Put the next number here and Oatcake carries on from it.
            {(used.invoice > 0 || used.quote > 0) && " It can't go back to a number you've already used."}
          </p>

          {msg && <p className={msg.bad ? "error" : "foot"}>{msg.text}</p>}
          <div className="doc-actions">
            <button className="btn" type="submit">Save</button>
            <button
              type="button"
              className="btn plain"
              onClick={() => setPreview({ url: "/settings/documents/preview", init: { method: "POST", body: new FormData(formRef.current!) }, filename: "Sample quote.pdf" })}
            >
              Preview a sample quote
            </button>
          </div>
          <p className="foot">The preview shows your changes straight away. Save to use them on real quotes.</p>
        </form>
      </fieldset>
      <PdfSheet request={preview} title="Sample quote" onClose={() => setPreview(null)} />
    </>
  );
}
