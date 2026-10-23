"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { saveProfile } from "@/lib/supabase/client";
import { chroma, distance, paletteCss, parseColours, PRESETS, randomPalette, rgbToHex } from "@/lib/palette";
import { flashSaved } from "./Saved";

type Rgb = [number, number, number];

// The main colours of an image: it's shrunk, its pixels grouped into similar shades, and the
// biggest groups picked, leaning towards lively ones so there's something to use as the accent,
// and skipping any too close to one already picked. The first one tints the page.
async function coloursFromImage(file: Blob): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((done, fail) => {
      const i = new Image();
      i.onload = () => done(i);
      i.onerror = fail;
      i.src = url;
    });
    const scale = Math.min(1, 96 / Math.max(img.naturalWidth || 96, img.naturalHeight || 96));
    const w = Math.max(1, Math.round((img.naturalWidth || 96) * scale)), h = Math.max(1, Math.round((img.naturalHeight || 96) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      const key = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
      const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bin.n++;
      bin.r += px[i];
      bin.g += px[i + 1];
      bin.b += px[i + 2];
      bins.set(key, bin);
    }
    const groups = [...bins.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 300)
      .map((g) => ({ n: g.n, rgb: [g.r / g.n, g.g / g.n, g.b / g.n] as Rgb }));
    const scored = groups.map((g) => ({ ...g, score: g.n * (0.5 + chroma(g.rgb) * 6) })).sort((a, b) => b.score - a.score);
    const picked: typeof groups = [];
    for (const g of scored) {
      if (picked.every((p) => distance(p.rgb, g.rgb) > 0.09)) picked.push(g);
      if (picked.length === 5) break;
    }
    // Biggest first, though between colours of much the same size the calmer one leads, so a
    // swatch of equal blocks tints the page with a quiet colour and keeps the loud one for accents.
    return picked.sort((a, b) => b.n * (1.2 - chroma(b.rgb) * 2) - a.n * (1.2 - chroma(a.rgb) * 2)).map((p) => rgbToHex(p.rgb));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PaletteIcon({ colours }: { colours: string[] | null }) {
  const dots = [
    [7.5, 10.5],
    [11, 7],
    [15.5, 7.5],
    [17.5, 11.5],
  ];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 0 0 5-5C21 6.6 17 3 12 3z" />
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.5" fill={colours?.[i % colours.length] ?? "currentColor"} stroke={colours ? "currentColor" : "none"} strokeWidth=".6" />
      ))}
    </svg>
  );
}

// One button that re-colours the whole app: drop in a palette image, a photo or a screenshot (or
// paste one, or hex codes, or a Coolors link), pick a preset, or let it surprise you. The colours
// change straight away, in light and dark mode, and are saved to the account (lib/palette.ts).
export default function Colours({ palette: saved }: { palette: string[] | null }) {
  const [palette, setPalette] = useState<string[] | null>(saved);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [picture, setPicture] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const css = useMemo(() => paletteCss(palette), [palette]);

  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);

  function apply(next: string[] | null) {
    // Everything fades into the new colours rather than snapping.
    const root = document.documentElement;
    root.classList.add("oc-retheme");
    setTimeout(() => root.classList.remove("oc-retheme"), 700);
    setPalette(next);
    setNote("");
    // Saved once the clicking stops, so a run of Surprise me is one save.
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await saveProfile({ data: { palette: next } });
      if (error) return setNote("Couldn't save these colours. They'll last until you reload.");
      flashSaved(next ? "Colours saved" : "Back to Oatcake");
      router.refresh();
    }, 700);
  }

  async function readImage(file: File) {
    setReading(true);
    setNote("");
    try {
      const found = await coloursFromImage(file);
      if (!found.length) return setNote("Couldn't find any colours in that image.");
      setPicture((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
      apply(found);
    } catch {
      setNote("That image wouldn't open. Try a PNG or JPG.");
    } finally {
      setReading(false);
    }
  }

  function readText(value: string) {
    const found = parseColours(value);
    if (!found.length) {
      setNote("No colours in that. Paste hex codes like #264653 or a Coolors link.");
      return false;
    }
    setPicture(null);
    apply(found);
    return true;
  }

  // An image or some text dropped on the button (or anywhere while the panel's open).
  function readDrop(data: DataTransfer) {
    const file = [...data.files].find((f) => f.type.startsWith("image/"));
    if (file) return void readImage(file);
    const value = data.getData("text/plain") || data.getData("text/uri-list");
    if (value) readText(value);
  }

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // A screenshot pasted while the panel is open is read like a dropped image.
    const paste = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        void readImage(file);
      } else {
        const value = e.clipboardData?.getData("text/plain");
        if (value && readText(value)) e.preventDefault();
      }
    };
    const drag = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      if (e.dataTransfer) readDrop(e.dataTransfer);
    };
    window.addEventListener("keydown", esc);
    window.addEventListener("paste", paste);
    window.addEventListener("dragover", drag);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("keydown", esc);
      window.removeEventListener("paste", paste);
      window.removeEventListener("dragover", drag);
      window.removeEventListener("drop", drop);
    };
  });

  const same = (p: string[]) => palette?.join() === p.join();

  return (
    <>
      {css && <style>{css}</style>}
      <button
        type="button"
        className={`theme-btn${over ? " over" : ""}`}
        onClick={() => setOpen((o) => !o)}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          readDrop(e.dataTransfer);
        }}
        aria-label="Colours: change the app's colour theme"
        aria-expanded={open}
        title="Colours (drop a palette image here)"
      >
        <PaletteIcon colours={palette} />
        <span>Colours</span>
      </button>
      {mounted &&
        createPortal(
          <MotionConfig reducedMotion="user">
            <AnimatePresence>
              {open && (
                <div className="pal-layer" key="colours">
                  <div className="pal-scrim" onClick={() => setOpen(false)} />
                  <motion.div
                    className="pal-panel"
                    role="dialog"
                    aria-label="Colours"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  >
                    <div className="pal-head">
                      <h2>Colours</h2>
                      <button type="button" className="sheet-close pal-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
                    </div>
                    <button
                      type="button"
                      className={`pal-drop${over ? " over" : ""}`}
                      onClick={() => fileInput.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setOver(true);
                      }}
                      onDragLeave={() => setOver(false)}
                    >
                      {picture ? <img src={picture} alt="" /> : <PaletteIcon colours={palette} />}
                      <span>
                        <b>{reading ? "Reading the colours…" : "Drop in a palette or a photo"}</b>
                        <small>Or tap to pick one. Pasting a screenshot works too.</small>
                      </span>
                    </button>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void readImage(file);
                        e.target.value = "";
                      }}
                    />
                    <form
                      className="pal-hex"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (readText(text)) setText("");
                      }}
                    >
                      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Hex codes or a Coolors link" aria-label="Hex codes or a Coolors link" />
                      <button type="submit" className="btn small" disabled={!text.trim()}>Use</button>
                    </form>
                    {note && <p className="pal-note">{note}</p>}
                    {palette && (
                      <div className="pal-now">
                        <div className="pal-swatches" role="group" aria-label="Your colours">
                          {palette.map((c, i) => (
                            <button
                              key={c + i}
                              type="button"
                              style={{ background: c }}
                              aria-pressed={i === 0}
                              title={i === 0 ? `${c}, tinting the page` : `${c}: tap to tint the page with it`}
                              aria-label={i === 0 ? `${c}, tinting the page` : `Tint the page with ${c}`}
                              onClick={() => i && apply([c, ...palette.filter((_, j) => j !== i)])}
                            />
                          ))}
                        </div>
                        <small>Tap a colour to tint the page with it.</small>
                      </div>
                    )}
                    <div className="pal-presets">
                      {PRESETS.map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          aria-pressed={same(p.colours)}
                          onClick={() => {
                            setPicture(null);
                            apply(p.colours);
                          }}
                        >
                          <span className="pal-strip">
                            {p.colours.map((c) => <i key={c} style={{ background: c }} />)}
                          </span>
                          {p.name}
                        </button>
                      ))}
                    </div>
                    <div className="pal-foot">
                      {palette ? (
                        <button type="button" className="link" onClick={() => { setPicture(null); apply(null); }}>Back to Oatcake</button>
                      ) : (
                        <span />
                      )}
                      <button type="button" className="btn small" onClick={() => { setPicture(null); apply(randomPalette()); }}>Surprise me</button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </MotionConfig>,
          document.body
        )}
    </>
  );
}
