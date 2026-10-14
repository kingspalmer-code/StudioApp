"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import { THUMB_WIDTH, area, cleanSvg, colourName, crop, isHex, recolour, type App, type AppBackground } from "@/lib/apps";
import { createClient } from "@/lib/supabase/client";
import { deleteApp, deleteBackground } from "../actions";

type Saved = AppBackground & { thumb: string; jpg: string; svg: string };

// The colours a new pattern app starts on: the Boomtowers blue mailer.
const START = { pattern: "#b5ace5", background: "#100062" };

// Draws an SVG onto a canvas at a set width and returns it as a JPG.
async function toJpeg(svg: string, width: number, height: number) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/jpeg", 0.92));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ColourField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value.toUpperCase());
  useEffect(() => setText(value.toUpperCase()), [value]);
  return (
    <div className="row">
      <label htmlFor={id}>{label}</label>
      <div className="ctl">
        <input
          aria-label={`${label} hex code`}
          value={text}
          maxLength={7}
          spellCheck={false}
          className="pm-hex"
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            const hex = v.startsWith("#") ? v : `#${v}`;
            if (isHex(hex)) onChange(hex.toLowerCase());
          }}
          onBlur={() => setText(value.toUpperCase())}
        />
      </div>
      <input id={id} type="color" className="pm-colour" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} />
    </div>
  );
}

export default function PatternApp({ app, slug, source, backgrounds, canEdit }: { app: App; slug: string; source: string | null; backgrounds: Saved[]; canEdit: boolean }) {
  const router = useRouter();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const last = backgrounds[0];
  const [pattern, setPattern] = useState(last?.pattern_color ?? START.pattern);
  const [background, setBackground] = useState(last?.background_color ?? START.background);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const [replacing, setReplacing] = useState(false);

  // The pattern itself, fetched once and kept as text to recolour.
  useEffect(() => {
    if (!source) return;
    let live = true;
    fetch(source)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => live && setSvg(cleanSvg(t)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [source]);

  // The preview is the pattern used as a mask over the pattern colour, on the background colour,
  // so changing either colour repaints at once without redrawing the pattern.
  const size = svg ? area(svg, app.frame) : null;
  const box = size?.box ?? app.frame ?? { x: 0, y: 0, w: 1, h: 2 };
  const mask = useMemo(() => (svg ? URL.createObjectURL(new Blob([crop(svg, area(svg, app.frame).box)], { type: "image/svg+xml" })) : null), [svg, app.frame]);
  useEffect(() => () => void (mask && URL.revokeObjectURL(mask)), [mask]);

  // Colour pairs already made here, to start from again with one tap.
  const pairs = useMemo(() => {
    const seen = new Map<string, { pattern: string; background: string }>();
    for (const b of backgrounds) seen.set(`${b.pattern_color}${b.background_color}`, { pattern: b.pattern_color, background: b.background_color });
    return [...seen.values()].slice(0, 12);
  }, [backgrounds]);
  const already = backgrounds.find((b) => b.pattern_color === pattern && b.background_color === background);

  async function create() {
    if (!svg || !size) return;
    setProblem("");
    try {
      setBusy("Drawing…");
      const [full, thumb] = await Promise.all([
        toJpeg(recolour(svg, pattern, background, app.frame, size.width), size.width, size.height),
        toJpeg(recolour(svg, pattern, background, app.frame, THUMB_WIDTH), THUMB_WIDTH, Math.round((THUMB_WIDTH * box.h) / box.w)),
      ]);
      const vector = new Blob([recolour(svg, pattern, background, app.frame)], { type: "image/svg+xml" });
      setBusy("Saving…");
      const supabase = createClient();
      const base = `${app.business_id}/${app.id}/${slug.replace(/[^\w-]+/g, "")}-${pattern.slice(1)}-${background.slice(1)}-${Date.now().toString(36)}`;
      const files = [
        { path: `${base}.jpg`, body: full, type: "image/jpeg" },
        { path: `${base}-small.jpg`, body: thumb, type: "image/jpeg" },
        { path: `${base}.svg`, body: vector, type: "image/svg+xml" },
      ];
      const ups = await Promise.all(files.map((f) => supabase.storage.from("apps").upload(f.path, f.body, { contentType: f.type })));
      if (ups.some((u) => u.error)) throw new Error("upload");
      const { error } = await supabase.from("app_backgrounds").insert({
        app_id: app.id,
        name: name.trim().slice(0, 80) || colourName(pattern, background),
        pattern_color: pattern,
        background_color: background,
        image_path: files[0].path,
        thumb_path: files[1].path,
        svg_path: files[2].path,
      });
      if (error) {
        await supabase.storage.from("apps").remove(files.map((f) => f.path));
        throw error;
      }
      setName("");
      router.refresh();
    } catch {
      setProblem("That background didn't save. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function replace(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    if (!/<svg\b/i.test(text)) return setProblem("That file isn't an SVG.");
    setBusy("Uploading…");
    const supabase = createClient();
    const path = `${app.business_id}/${app.id}/pattern-${Date.now()}.svg`;
    const up = await supabase.storage.from("apps").upload(path, new Blob([cleanSvg(text)], { type: "image/svg+xml" }), { contentType: "image/svg+xml" });
    if (up.error) {
      setBusy("");
      return setProblem("The pattern didn't upload. Try again.");
    }
    await supabase.from("apps").update({ source_path: path }).eq("id", app.id);
    if (app.source_path) await supabase.storage.from("apps").remove([app.source_path]);
    setBusy("");
    setReplacing(false);
    router.refresh();
  }

  return (
    <>
      <div className="pattern-maker">
        <div className="pattern-stage" style={{ background, aspectRatio: `${box.w} / ${box.h}` }}>
          {mask ? (
            <div className="pattern-lines" style={{ background: pattern, WebkitMaskImage: `url(${mask})`, maskImage: `url(${mask})` }} />
          ) : (
            !source && canEdit ? (
              <label className="btn file-btn">
                {busy === "Uploading…" ? busy : "Add the pattern (SVG)"}
                <input type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => void replace(e.target.files?.[0])} />
              </label>
            ) : (
              <span className="when pattern-wait">{!source ? "No pattern added yet." : failed ? "The pattern didn't load. Refresh to try again." : "Loading the pattern…"}</span>
            )
          )}
        </div>
        <div className="pattern-controls">
          {canEdit ? (
            <>
              <div className="group">
                <ColourField id="pat-colour" label="Pattern" value={pattern} onChange={setPattern} />
                <ColourField id="bg-colour" label="Background" value={background} onChange={setBackground} />
                <div className="row">
                  <button type="button" className="link" onClick={() => { setPattern(background); setBackground(pattern); }}>Swap colours</button>
                </div>
              </div>
              {pairs.length > 0 && (
                <>
                  <p className="eyebrow">Used before</p>
                  <div className="pm-pairs">
                    {pairs.map((c) => (
                      <button
                        key={c.pattern + c.background}
                        type="button"
                        className="pm-pair"
                        style={{ background: c.background, borderColor: c.pattern }}
                        aria-pressed={c.pattern === pattern && c.background === background}
                        aria-label={colourName(c.pattern, c.background)}
                        title={colourName(c.pattern, c.background)}
                        onClick={() => { setPattern(c.pattern); setBackground(c.background); }}
                      />
                    ))}
                  </div>
                </>
              )}
              <p className="eyebrow">Save it</p>
              <div className="group">
                <div className="row">
                  <label htmlFor="bg-name">Name</label>
                  <div className="ctl"><input id="bg-name" value={name} maxLength={80} placeholder={colourName(pattern, background)} onChange={(e) => setName(e.target.value)} /></div>
                </div>
              </div>
              <button type="button" className="btn wide" disabled={!svg || Boolean(busy)} onClick={() => void create()}>
                {busy || "Create background"}
              </button>
              {already && !busy && <p className="when pattern-note">You&apos;ve made this one before: {already.name}.</p>}
              {problem && <p className="error">{problem}</p>}
              {size && <p className="when pattern-note">Saves a {size.width} × {size.height} JPG and an SVG to the backgrounds below.</p>}
            </>
          ) : (
            <p className="when">Pick a background below to download it.</p>
          )}
        </div>
      </div>

      <div className="eyebrow-row">
        <p className="eyebrow">Backgrounds{backgrounds.length ? ` · ${backgrounds.length}` : ""}</p>
      </div>
      {backgrounds.length ? (
        <div className="gallery pattern-gallery">
          {backgrounds.map((b) => (
            <div key={b.id} className="gallery-card">
              <span className="gallery-img" style={{ aspectRatio: `${box.w} / ${box.h}`, background: b.background_color }}>
                {b.thumb ? <img src={b.thumb} alt="" loading="lazy" /> : null}
              </span>
              <b>{b.name}</b>
              <small className="when pm-meta">
                <span className="pm-dot" style={{ background: b.pattern_color }} /><span className="pm-dot" style={{ background: b.background_color }} />
                {new Date(b.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </small>
              <span className="pattern-actions">
                {b.jpg && <a className="btn plain small" href={b.jpg}>JPG</a>}
                {b.svg && <a className="btn plain small" href={b.svg}>SVG</a>}
                {canEdit && (
                  <button type="button" className="link pm-small" onClick={() => { setPattern(b.pattern_color); setBackground(b.background_color); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                    Use colours
                  </button>
                )}
                {canEdit && <ConfirmButton label="Remove" ask="Remove it?" yes="Remove" className="link pm-small danger-link" onConfirm={() => void deleteBackground(b.id).then(() => router.refresh())} />}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="group"><div className="empty">No backgrounds yet.{canEdit ? " Pick two colours and create the first." : ""}</div></div>
      )}

      {canEdit && (
        <>
          <p className="eyebrow">App</p>
          <div className="group">
            <div className="row">
              <div className="ctl">
                <div style={{ fontWeight: 600 }}>Pattern</div>
                <div className="when">An SVG in one colour with no background. Backgrounds already made stay as they are.</div>
              </div>
              {replacing ? (
                <label className="btn plain small file-btn">
                  {busy === "Uploading…" ? busy : "Choose SVG"}
                  <input type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => void replace(e.target.files?.[0])} />
                </label>
              ) : (
                <button type="button" className="link" onClick={() => setReplacing(true)}>{source ? "Replace" : "Add"}</button>
              )}
            </div>
            <div className="row">
              <div className="ctl"><div style={{ fontWeight: 600 }}>Delete this app</div><div className="when">And every background saved in it.</div></div>
              <ConfirmButton label="Delete" ask="Delete the app and its backgrounds?" yes="Delete" className="link danger-link" onConfirm={() => void deleteApp(app.id)} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
