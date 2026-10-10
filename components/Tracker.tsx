"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { flush, normPath, push, setTracking, track } from "@/lib/track";

const IDLE = 60_000; // no taps, keys or scrolling for a minute counts as away
const TICK = 5_000;

// Records which pages people use and for how long (only while the tab is in front and they're
// active), whether forms get started but not sent, errors they see, and rapid repeated taps.
// Admins read it in Admin → Overview. Nothing typed into forms is recorded.
export default function Tracker() {
  const pathname = usePathname();
  const path = normPath(pathname);
  const state = useRef({ path, active: 0, lastInput: Date.now(), started: false, sent: false, seen: new Set<string>() });

  useEffect(() => {
    setTracking(true);
    const s = state.current;
    const saveTime = () => {
      if (s.active > 0) push({ kind: "time", path: s.path, ms: Math.min(s.active, 600_000) });
      s.active = 0;
    };
    const tick = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - s.lastInput < IDLE) s.active += TICK;
      if (s.active >= 60_000) {
        saveTime();
        flush();
      }
    }, TICK);
    let lastMove = 0;
    const input = () => (s.lastInput = Date.now());
    const move = () => {
      const now = Date.now();
      if (now - lastMove > 2000) (lastMove = now), input();
    };
    const away = () => {
      if (document.visibilityState === "hidden") {
        saveTime();
        flush();
      } else input();
    };
    const leave = () => {
      saveTime();
      flush();
    };

    // Forms: started (first keystroke) and sent, once per page visit. Ask Oatcake has its own stats.
    const inForm = (t: EventTarget | null) => {
      const el = t instanceof Element ? t : null;
      return el?.closest("form") && !el.closest(".ask-sheet, .walk");
    };
    const typed = (e: Event) => {
      input();
      if (!s.started && inForm(e.target)) {
        s.started = true;
        track("form_start");
      }
    };
    const submitted = (e: Event) => {
      if (!s.sent && inForm(e.target)) {
        s.sent = true;
        track("form_send");
      }
    };

    // Rapid repeated taps on the same spot usually mean something didn't respond.
    let taps: { t: number; x: number; y: number }[] = [];
    let lastRage = 0;
    const clicked = (e: MouseEvent) => {
      input();
      const now = Date.now();
      // Only taps on things meant to be tapped; triple-clicking text to select it is normal.
      const el = e.target instanceof Element ? e.target.closest("button, a, label, select, summary, [role=button]") : null;
      if (!el) return;
      taps = [...taps.filter((c) => now - c.t < 800 && Math.hypot(c.x - e.clientX, c.y - e.clientY) < 40), { t: now, x: e.clientX, y: e.clientY }];
      if (taps.length >= 3 && now - lastRage > 3000) {
        lastRage = now;
        taps = [];
        const text = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 80);
        push({ kind: "error", name: "rage", path: normPath(location.pathname), meta: { text } });
      }
    };

    // Errors: crashes, and the red messages people are shown.
    const report = (name: string, text: string) => {
      const key = `${name}:${text}`;
      if (!text || s.seen.has(key)) return;
      s.seen.add(key);
      push({ kind: "error", name, path: normPath(location.pathname), meta: { text: text.slice(0, 200) } });
    };
    const crashed = (e: ErrorEvent) => report("crash", e.message || "Script error");
    const rejected = (e: PromiseRejectionEvent) => report("crash", String((e.reason as Error)?.message ?? e.reason ?? "").slice(0, 200));
    let pending: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        document.querySelectorAll<HTMLElement>(".error").forEach((el) => {
          if (el.offsetParent !== null) report("shown", (el.textContent ?? "").trim().replace(/\s+/g, " "));
        });
      }, 400);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    window.addEventListener("pointerdown", input, { passive: true });
    window.addEventListener("scroll", input, { passive: true, capture: true });
    window.addEventListener("mousemove", move, { passive: true });
    window.addEventListener("keydown", typed, true);
    window.addEventListener("input", typed, true);
    window.addEventListener("submit", submitted, true);
    window.addEventListener("click", clicked, true);
    window.addEventListener("error", crashed);
    window.addEventListener("unhandledrejection", rejected);
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", leave);
    return () => {
      leave();
      clearInterval(tick);
      clearTimeout(pending);
      observer.disconnect();
      window.removeEventListener("pointerdown", input);
      window.removeEventListener("scroll", input, true);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("keydown", typed, true);
      window.removeEventListener("input", typed, true);
      window.removeEventListener("submit", submitted, true);
      window.removeEventListener("click", clicked, true);
      window.removeEventListener("error", crashed);
      window.removeEventListener("unhandledrejection", rejected);
      document.removeEventListener("visibilitychange", away);
      window.removeEventListener("pagehide", leave);
      setTracking(false);
    };
  }, []);

  // A new page: close off time on the last one and count a view of this one.
  useEffect(() => {
    const s = state.current;
    if (s.path !== path && s.active > 0) push({ kind: "time", path: s.path, ms: Math.min(s.active, 600_000) });
    Object.assign(s, { path, active: 0, started: false, sent: false, seen: new Set<string>(), lastInput: Date.now() });
    push({ kind: "view", path });
  }, [path]);

  return null;
}
