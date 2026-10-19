"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import OatcakeBiscuit from "./OatcakeBiscuit";
import { flashSaved } from "./Saved";

// On wide screens a job opens here, on the right, so the queue stays in view beside it. The job's
// own page loads in a frame (html.embedded hides its sidebar and bars, see app/layout.tsx).
// Jobs are loaded ahead in hidden frames (the top of the queue, and whatever you hover), so most
// open instantly; the open one and a few recent ones stay loaded for flicking back and forth.
export const SPLIT_QUERY = "(min-width: 1100px)";
// The pages that open in the panel: one level under `under`, such as /tickets/12 or /settings/stages.
export const opensHere = (under: string, path: string) => path.startsWith(under + "/") && !path.slice(under.length + 1).includes("/");
const KEEP = 5; // frames kept loaded at most
const STALE = 2 * 60_000; // a hidden frame older than this is dropped, so it's loaded fresh next time

// src stays what the frame was first given; href follows the page it shows now (links inside can move it on).
const MIN_W = 380; // narrowest the panel drags to
const QUEUE_MIN = 460; // room always left for the queue beside it

// How wide you last dragged the panel, kept on this computer; double-click the edge to reset.
function setWidth(w: number | null) {
  const root = document.documentElement;
  if (w === null) return root.style.removeProperty("--split-w");
  const rail = parseInt(getComputedStyle(root).getPropertyValue("--rail-w")) || 68;
  root.style.setProperty("--split-w", `${Math.round(Math.max(MIN_W, Math.min(window.innerWidth - rail - QUEUE_MIN, w)))}px`);
}
function savedWidth() {
  try { return Number(localStorage.getItem("split_w")) || null; } catch { return null; }
}
function saveWidth(w: number | null) {
  try { if (w === null) localStorage.removeItem("split_w"); else localStorage.setItem("split_w", String(w)); } catch {}
}

function SplitGrip() {
  const start = useRef<{ x: number; w: number } | null>(null);
  const panelW = () => document.querySelector(".split-panel")?.getBoundingClientRect().width ?? 560;
  return (
    <div
      className="split-grip"
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to resize the panel"
      title="Drag to resize, or double-click to reset"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: panelW() };
        document.documentElement.classList.add("split-dragging");
      }}
      onPointerMove={(e) => start.current && setWidth(start.current.w - (e.clientX - start.current.x))}
      onPointerUp={() => {
        if (!start.current) return;
        start.current = null;
        document.documentElement.classList.remove("split-dragging");
        saveWidth(Math.round(panelW()));
      }}
      onPointerCancel={() => { start.current = null; document.documentElement.classList.remove("split-dragging"); }}
      onDoubleClick={() => { setWidth(null); saveWidth(null); }}
    />
  );
}

type Frame = { slot: number; href: string; src: string; loaded: boolean; at: number };
let slots = 0;

export default function SplitPanel({
  under,
  label,
  openHref,
  warm,
  onOpen,
  onClose,
}: {
  under: string;
  label: string;
  openHref: string | null;
  warm: string[];
  onOpen: (href: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [wide, setWide] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const refs = useRef(new Map<number, HTMLIFrameElement>());
  const live = useRef({ openHref, onOpen, onClose });
  live.current = { openHref, onOpen, onClose };

  useEffect(() => {
    const mq = window.matchMedia(SPLIT_QUERY);
    const fit = () => setWide(mq.matches);
    fit();
    const w = savedWidth();
    if (w) setWidth(w);
    mq.addEventListener("change", fit);
    return () => mq.removeEventListener("change", fit);
  }, []);

  // Keep a frame for the open job and the ones worth loading ahead; let the oldest others go.
  // Every so often hidden frames that have sat too long are swapped for fresh ones.
  const want = [openHref, ...warm].filter((h): h is string => h !== null);
  const wantKey = want.join(" ");
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setBeat((b) => b + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!wide) return setFrames((fs) => (fs.length ? [] : fs));
    const hrefs = wantKey ? wantKey.split(" ") : [];
    const now = Date.now();
    setFrames((fs) => {
      const fresh = fs.filter((f) => f.href === live.current.openHref || !f.loaded || now - f.at < STALE);
      const missing = hrefs.filter((h, i) => hrefs.indexOf(h) === i && !fresh.some((f) => f.href === h));
      if (fresh.length === fs.length && !missing.length && fs.length <= KEEP) return fs;
      const next = [...fresh, ...missing.map((href) => ({ slot: ++slots, href, src: href, loaded: false, at: now }))];
      while (next.length > KEEP) {
        const i = next.findIndex((f) => !hrefs.includes(f.href));
        if (i < 0) break;
        next.splice(i, 1);
      }
      return next;
    });
  }, [wide, wantKey, beat]);

  // Anything done in what's open (a status change, a note) should show in the list once you close it.
  const close = () => {
    live.current.onClose();
    router.refresh();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Something was saved in a job open here (components/FrameChanged.tsx): show it in the queue now.
  // A saved edit that's finished with the job (components/SaveForm.tsx) closes the panel too.
  useEffect(() => {
    const changed = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "oatcake:changed" && e.data?.type !== "oatcake:done") return;
      if (![...refs.current.values()].some((f) => f.contentWindow === e.source)) return;
      if (e.data.type === "oatcake:done") {
        flashSaved(String(e.data.text || "Saved"));
        return closeRef.current();
      }
      router.refresh();
    };
    window.addEventListener("message", changed);
    return () => window.removeEventListener("message", changed);
  }, [router]);

  useEffect(() => {
    if (openHref === null) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && closeRef.current();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [openHref]);

  // A frame finished loading. Links inside the open job: another job carries on here; anything
  // else (a document, deleting the job, which goes back to the queue) takes the whole window,
  // or just refreshes the list when it leads back to the page the list is on.
  const loaded = (f: Frame) => {
    let loc: Location | undefined;
    const win = refs.current.get(f.slot)?.contentWindow;
    try { loc = win?.location; } catch { return; }
    if (!loc || loc.href === "about:blank") return;
    const shown = f.href === live.current.openHref;
    if (opensHere(under, loc.pathname)) {
      const href = loc.pathname;
      setFrames((fs) => fs.map((x) => (x.slot === f.slot ? { ...x, href, loaded: true, at: Date.now() } : x)));
      win?.addEventListener("keydown", (e) => e.key === "Escape" && closeRef.current());
      if (shown && href !== f.href) live.current.onOpen(href);
      return;
    }
    setFrames((fs) => fs.filter((x) => x.slot !== f.slot));
    if (!shown) return;
    live.current.onClose();
    if (loc.pathname === window.location.pathname) router.refresh();
    else window.location.href = loc.href;
  };

  const current = openHref === null ? undefined : frames.find((f) => f.href === openHref && f.loaded) ?? frames.find((f) => f.href === openHref);

  return (
    <aside className={openHref === null ? "split-panel" : "split-panel on"} aria-label={label} aria-hidden={openHref === null}>
      {openHref !== null && <SplitGrip />}
      {openHref !== null && (
        <div className="split-head">
          <button type="button" className="split-btn" onClick={close} aria-label="Close" title="Close (Esc)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <a className="split-btn split-full" href={openHref} title="Open the full page">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-8 8M10 5H5v14h14v-5" /></svg>
            <span>Full page</span>
          </a>
        </div>
      )}
      <div className="split-body">
        {openHref !== null && !current?.loaded && (
          <div className="split-loading" role="status" aria-label="Loading">
            <OatcakeBiscuit eating />
          </div>
        )}
        {frames.map((f) => {
          const on = f === current;
          return (
            <iframe
              key={f.slot}
              ref={(el) => { if (el) refs.current.set(f.slot, el); else refs.current.delete(f.slot); }}
              src={f.src}
              title={label}
              tabIndex={on ? 0 : -1}
              aria-hidden={!on}
              className={on && f.loaded ? "shown" : undefined}
              onLoad={() => loaded(f)}
            />
          );
        })}
      </div>
    </aside>
  );
}
