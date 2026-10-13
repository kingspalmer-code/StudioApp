"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// On wide screens a job opens here, on the right, so the queue stays in view beside it. The job's
// own page loads in a frame (html.embedded hides its sidebar and bars, see app/layout.tsx).
export const SPLIT_QUERY = "(min-width: 1100px)";

export default function SplitPanel({ id, onOpen, onClose }: { id: number; onOpen: (id: number) => void; onClose: () => void }) {
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);

  // Anything done in the job (a status change, a note) should show in the queue once you close it.
  const close = () => {
    onClose();
    router.refresh();
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && close();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // Links inside the job: another job opens here too; anything else (a document, deleting the job,
  // which goes back to the queue) takes the whole window.
  const loaded = () => {
    let loc: Location | undefined;
    try { loc = frame.current?.contentWindow?.location; } catch { return; }
    if (!loc || loc.href === "about:blank") return;
    const m = loc.pathname.match(/^\/tickets\/(\d+)$/);
    if (m) {
      if (Number(m[1]) !== id) onOpen(Number(m[1]));
      const win = frame.current?.contentWindow;
      win?.addEventListener("keydown", (e) => e.key === "Escape" && close());
      return;
    }
    onClose();
    if (loc.pathname === "/queue") router.refresh();
    else window.location.href = loc.href;
  };

  return (
    <aside className="split-panel" aria-label="Job">
      <div className="split-head">
        <button type="button" className="split-btn" onClick={close} aria-label="Close" title="Close (Esc)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <a className="split-btn split-full" href={`/tickets/${id}`} title="Open the full page">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-8 8M10 5H5v14h14v-5" /></svg>
          <span>Full page</span>
        </a>
      </div>
      <iframe ref={frame} key={id} src={`/tickets/${id}`} title="Job" onLoad={loaded} />
    </aside>
  );
}
