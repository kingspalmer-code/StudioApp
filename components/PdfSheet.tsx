"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Shows a quote or invoice PDF inside Oatcake: a sheet that slides up on phones and a centred
// panel on bigger screens. Pages are drawn with pdf.js rather than an embedded PDF, because
// iPhone Safari only shows the first page of an embedded PDF and won't scroll it.
// The "legacy" build of pdf.js is used so it also works on older iPhones.
export type PdfRequest = { url: string; init?: RequestInit; filename: string };

export default function PdfSheet({
  request,
  title,
  onClose,
  actions,
}: {
  request: PdfRequest | null;
  title: string;
  onClose: () => void;
  actions?: ReactNode;
}) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 720px)");
    setWide(m.matches);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  return (
    <AnimatePresence>
      {request && (
        <div className="sheet-wrap" key="sheet">
          <motion.div className="sheet-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={wide ? { opacity: 0, scale: 0.96, y: 12 } : { y: "100%" }}
            animate={wide ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={wide ? { opacity: 0, scale: 0.97, y: 8 } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <SheetBody request={request} title={title} onClose={onClose} actions={actions} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function SheetBody({ request, title, onClose, actions }: { request: PdfRequest; title: string; onClose: () => void; actions?: ReactNode }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const close = useRef(onClose);
  close.current = onClose;

  // Esc closes, the page behind stays still, and focus starts on Close.
  useEffect(() => {
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", key);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const res = await fetch(request.url, request.init);
        if (!res.ok || !res.headers.get("content-type")?.includes("pdf")) throw new Error(String(res.status));
        const bytes = await res.arrayBuffer();
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        setBlobUrl(url);

        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: "/pdfjs/standard_fonts/" });
        task = loading;
        const pdf = await loading.promise;
        const box = pagesRef.current;
        if (cancelled || !box) return;
        box.replaceChildren();
        // Drawn sharper than the screen needs, so pinch-zooming stays crisp.
        const target = Math.min(box.clientWidth, 820) * Math.min(3, (window.devicePixelRatio || 1) * 1.5);
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: target / base.width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "sheet-page";
          canvas.setAttribute("aria-label", `Page ${n} of ${pdf.numPages}`);
          box.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
          if (cancelled) return;
          if (n === 1) setState("ready");
        }
      } catch (e) {
        console.error("pdf preview", e);
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      task?.destroy();
      if (url) URL.revokeObjectURL(url);
    };
  }, [request]);

  return (
    <>
      <div className="sheet-head">
        <span className="sheet-grabber" aria-hidden="true" />
        <b>{title}</b>
        <button ref={closeRef} type="button" className="sheet-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="sheet-scroll">
        {state === "loading" && <p className="sheet-note">Making the PDF…</p>}
        {state === "failed" && <p className="sheet-note">The PDF couldn&apos;t be made. Close this and try again in a moment.</p>}
        <div ref={pagesRef} className="sheet-pages" hidden={state === "failed"} />
      </div>
      <div className="sheet-foot">
        {blobUrl ? (
          <a className="btn plain" href={blobUrl} download={request.filename}>Download PDF</a>
        ) : (
          <button type="button" className="btn plain" disabled>Download PDF</button>
        )}
        {actions}
      </div>
    </>
  );
}
