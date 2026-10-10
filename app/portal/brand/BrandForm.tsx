"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveBrand } from "../actions";

const SWATCHES = ["#1f2a44", "#2f6f4f", "#b5452b", "#d98e04", "#7a3e8e", "#1c1c1e", "#0f6e8c", "#c2185b"];

// Black or white text, whichever reads better on the colour.
function inkFor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#1c1c1e" : "#ffffff";
}

export default function BrandForm({
  biz,
  shownLogo,
  ownLogo,
  accent: startAccent,
  custom,
}: {
  biz: { id: string; name: string };
  shownLogo: string;
  ownLogo: string;
  accent: string;
  custom: boolean;
}) {
  const router = useRouter();
  const [logo, setLogo] = useState(ownLogo);
  const [preview, setPreview] = useState(shownLogo);
  const [accent, setAccent] = useState(/^#[0-9a-f]{6}$/i.test(startAccent) ? startAccent : "#1f2a44");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return setMsg({ text: "Use a PNG, JPG, WebP or SVG file.", bad: true });
    if (file.size > 2 * 1024 * 1024) return setMsg({ text: "That logo is over 2MB. Try a smaller version.", bad: true });
    setBusy("Uploading…");
    setMsg(null);
    const supabase = createClient();
    const path = `${biz.id}/${crypto.randomUUID()}.${file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1]}`;
    const { error } = await supabase.storage.from("brand-logos").upload(path, file, { contentType: file.type });
    setBusy("");
    if (error) return setMsg({ text: `That logo didn't upload. ${error.message}`, bad: true });
    const url = supabase.storage.from("brand-logos").getPublicUrl(path).data.publicUrl;
    setLogo(url);
    setPreview(url);
  }

  async function save(reset = false) {
    setBusy(reset ? "Resetting…" : "Saving…");
    const res = await saveBrand(biz.id, reset ? "" : logo, reset ? null : accent);
    setBusy("");
    if (res.error) return setMsg({ text: res.error, bad: true });
    setMsg({ text: reset ? "Back to how it was." : "Saved. Your portal uses it now." });
    router.refresh();
  }

  return (
    <>
      <p className="eyebrow">Logo</p>
      <div className="group">
        <div className="row photo-row">
          <span className="brand-logo-tile">{preview ? <img src={preview} alt={`${biz.name} logo`} /> : <b>{biz.name.slice(0, 2).toUpperCase()}</b>}</span>
          <div className="ctl">
            <label className="btn plain small file-btn">
              {busy === "Uploading…" ? busy : preview ? "Change logo" : "Add logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden disabled={Boolean(busy)} onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            <div className="when" style={{ marginTop: 6 }}>A wide logo on a clear or white background works best.</div>
          </div>
        </div>
      </div>

      <p className="eyebrow">Colour</p>
      <div className="group">
        <div className="row swatch-row">
          {SWATCHES.map((c) => (
            <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={c} aria-pressed={accent.toLowerCase() === c} onClick={() => setAccent(c)} />
          ))}
          <label className="swatch custom" aria-label="Pick any colour" style={{ background: SWATCHES.includes(accent.toLowerCase()) ? undefined : accent }}>
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <span className="k">Preview</span>
          <div className="ctl brand-preview">
            <span className="btn small" style={{ background: accent, color: inkFor(accent) }}>+ New request</span>
            <span className="chip" style={{ background: `${accent}22`, color: accent }}>In progress</span>
          </div>
        </div>
      </div>

      {msg && <p className={msg.bad ? "error" : "foot"} style={msg.bad ? undefined : { color: "var(--green)", fontWeight: 600 }}>{msg.text}</p>}
      <button type="button" className="btn wide" disabled={Boolean(busy)} onClick={() => save()}>{busy && busy !== "Uploading…" ? busy : "Save"}</button>
      {custom && (
        <p className="foot" style={{ textAlign: "center" }}>
          <button type="button" className="link" onClick={() => save(true)} disabled={Boolean(busy)}>Go back to the original logo and colour</button>
        </p>
      )}
    </>
  );
}
