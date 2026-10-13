"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import OatcakeBiscuit from "./OatcakeBiscuit";

// On wide screens a job opens here, on the right, so the queue stays in view beside it. The job's
// own page loads in a frame (html.embedded hides its sidebar and bars, see app/layout.tsx).
// Jobs are loaded ahead in hidden frames (the top of the queue, and whatever you hover), so most
// open instantly; the open one and a few recent ones stay loaded for flicking back and forth.
export const SPLIT_QUERY = "(min-width: 1100px)";
const KEEP = 5; // frames kept loaded at most
const STALE = 2 * 60_000; // a hidden frame older than this is dropped, so it's loaded fresh next time

// src stays what the frame was first given; id follows the job it shows now (links inside can move it on).
type Frame = { slot: number; id: number; src: string; loaded: boolean; at: number };
let slots = 0;

export default function SplitPanel({
  openId,
  warm,
  onOpen,
  onClose,
}: {
  openId: number | null;
  warm: number[];
  onOpen: (id: number) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [wide, setWide] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const refs = useRef(new Map<number, HTMLIFrameElement>());
  const live = useRef({ openId, onOpen, onClose });
  live.current = { openId, onOpen, onClose };

  useEffect(() => {
    const mq = window.matchMedia(SPLIT_QUERY);
    const fit = () => setWide(mq.matches);
    fit();
    mq.addEventListener("change", fit);
    return () => mq.removeEventListener("change", fit);
  }, []);

  // Keep a frame for the open job and the ones worth loading ahead; let the oldest others go.
  // Every so often hidden frames that have sat too long are swapped for fresh ones.
  const want = [openId, ...warm].filter((id): id is number => id !== null);
  const wantKey = want.join(",");
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setBeat((b) => b + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!wide) return setFrames((fs) => (fs.length ? [] : fs));
    const ids = wantKey ? wantKey.split(",").map(Number) : [];
    const now = Date.now();
    setFrames((fs) => {
      const fresh = fs.filter((f) => f.id === live.current.openId || !f.loaded || now - f.at < STALE);
      const missing = ids.filter((id, i) => ids.indexOf(id) === i && !fresh.some((f) => f.id === id));
      if (fresh.length === fs.length && !missing.length && fs.length <= KEEP) return fs;
      const next = [...fresh, ...missing.map((id) => ({ slot: ++slots, id, src: `/tickets/${id}`, loaded: false, at: now }))];
      while (next.length > KEEP) {
        const i = next.findIndex((f) => !ids.includes(f.id));
        if (i < 0) break;
        next.splice(i, 1);
      }
      return next;
    });
  }, [wide, wantKey, beat]);

  // Anything done in the job (a status change, a note) should show in the queue once you close it.
  const close = () => {
    live.current.onClose();
    router.refresh();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (openId === null) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && closeRef.current();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [openId]);

  // A frame finished loading. Links inside the open job: another job carries on here; anything
  // else (a document, deleting the job, which goes back to the queue) takes the whole window.
  const loaded = (f: Frame) => {
    let loc: Location | undefined;
    const win = refs.current.get(f.slot)?.contentWindow;
    try { loc = win?.location; } catch { return; }
    if (!loc || loc.href === "about:blank") return;
    const shown = f.id === live.current.openId;
    const m = loc.pathname.match(/^\/tickets\/(\d+)$/);
    if (m) {
      const id = Number(m[1]);
      setFrames((fs) => fs.map((x) => (x.slot === f.slot ? { ...x, id, loaded: true, at: Date.now() } : x)));
      win?.addEventListener("keydown", (e) => e.key === "Escape" && closeRef.current());
      if (shown && id !== f.id) live.current.onOpen(id);
      return;
    }
    setFrames((fs) => fs.filter((x) => x.slot !== f.slot));
    if (!shown) return;
    live.current.onClose();
    if (loc.pathname === "/queue") router.refresh();
    else window.location.href = loc.href;
  };

  const current = openId === null ? undefined : frames.find((f) => f.id === openId && f.loaded) ?? frames.find((f) => f.id === openId);

  return (
    <aside className={openId === null ? "split-panel" : "split-panel on"} aria-label="Job" aria-hidden={openId === null}>
      {openId !== null && (
        <div className="split-head">
          <button type="button" className="split-btn" onClick={close} aria-label="Close" title="Close (Esc)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <a className="split-btn split-full" href={`/tickets/${openId}`} title="Open the full page">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-8 8M10 5H5v14h14v-5" /></svg>
            <span>Full page</span>
          </a>
        </div>
      )}
      <div className="split-body">
        {openId !== null && !current?.loaded && (
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
              title="Job"
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
