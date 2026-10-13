"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

// A thin bar along the top that starts the moment a link is clicked and finishes when the new page
// is on screen, so every tap shows something straight away.
function Bar() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<"idle" | "going" | "done">("idle");

  useEffect(() => {
    setState((s) => (s === "going" ? "done" : s));
  }, [path, search]);

  useEffect(() => {
    if (state === "done") {
      const t = setTimeout(() => setState("idle"), 250);
      return () => clearTimeout(t);
    }
    if (state === "going") {
      // Never stays stuck: a page that doesn't change the address (or fails) still ends the bar.
      const t = setTimeout(() => setState("done"), 8000);
      return () => clearTimeout(t);
    }
  }, [state]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setState("going");
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return <div className="nav-progress" data-state={state} aria-hidden />;
}

export default function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
