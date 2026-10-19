"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

// What happens after something is saved: a short "Saved" note slides in at the top, and where the
// person came to the page to edit one thing (a job's details), they're taken back to where they
// were. Both live in the root layout (app/layout.tsx), so the note stays up across the move.
const SAVED_EVENT = "oc-saved";
const PREV_KEY = "oc_prev_page";

export function flashSaved(text = "Saved") {
  window.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail: text }));
}

// The page someone was on before this one, if they got here inside Oatcake (this tab).
export function previousPage(): string | null {
  try {
    const prev = sessionStorage.getItem(PREV_KEY);
    return prev && new URL(prev, location.origin).pathname !== location.pathname ? prev : null;
  } catch {
    return null;
  }
}

function Trail() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const current = useRef<string | null>(null);
  useEffect(() => {
    const here = search ? `${path}?${search}` : path;
    if (window.top !== window.self) return;
    // A full page load (a link opened fresh, a refresh) starts from the page that linked here, if it was ours.
    let prev = current.current;
    if (prev === null) {
      const ref = document.referrer ? new URL(document.referrer) : null;
      prev = ref && ref.origin === location.origin ? ref.pathname + ref.search : "";
    }
    if (prev !== here) {
      try { sessionStorage.setItem(PREV_KEY, prev); } catch {}
    }
    current.current = here;
  }, [path, search]);
  return null;
}

function Toast() {
  const [note, setNote] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    const show = (e: Event) => setNote((x) => ({ text: (e as CustomEvent<string>).detail, n: (x?.n ?? 0) + 1 }));
    // A job open beside the queue (components/SplitPanel.tsx) hands its note out to this window.
    const fromFrame = (e: MessageEvent) => {
      if (e.origin === location.origin && e.data?.type === "oatcake:saved") flashSaved(String(e.data.text || "Saved"));
    };
    window.addEventListener(SAVED_EVENT, show);
    window.addEventListener("message", fromFrame);
    return () => {
      window.removeEventListener(SAVED_EVENT, show);
      window.removeEventListener("message", fromFrame);
    };
  }, []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(t);
  }, [note]);
  return (
    <div className="saved-toast-wrap" role="status" aria-live="polite">
      {note && (
        <div className="saved-toast" key={note.n}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          {note.text}
        </div>
      )}
    </div>
  );
}

export default function Saved() {
  return (
    <>
      <Suspense fallback={null}><Trail /></Suspense>
      <Toast />
    </>
  );
}
