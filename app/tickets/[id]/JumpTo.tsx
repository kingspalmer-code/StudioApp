"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

// Opened from a notification (?at=<when>): scroll to the note or draft that happened then and
// light it up for a moment, instead of leaving you at the top of the Notes or Drafts section.
export default function JumpTo() {
  const at = useSearchParams().get("at");
  useEffect(() => {
    const when = at ? Date.parse(at) : NaN;
    if (!Number.isFinite(when)) return;
    const timer = window.setTimeout(() => {
      let el: HTMLElement | null = null;
      let gap = Infinity;
      for (const x of document.querySelectorAll<HTMLElement>("main [data-at]")) {
        const d = Math.abs(Date.parse(x.dataset.at ?? "") - when);
        if (d < gap) [el, gap] = [x, d];
      }
      // Within a few minutes, so a deleted note doesn't send you to a different one.
      if (!el || gap > 5 * 60_000) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.remove("jumped");
      void el.offsetWidth;
      el.classList.add("jumped");
    }, 120);
    return () => window.clearTimeout(timer);
  }, [at]);
  return null;
}
