"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// A short first-login tour of the Jobs page. The page dims, the part being explained lifts out
// in a soft spotlight, and a small card says what it's for. It shows once per person (remembered
// on their account), and "Show me around again" in their account replays it.
type Step = { target?: string | string[]; title: string; text: string };

const SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;
const SOFT = { type: "spring", stiffness: 170, damping: 26 } as const;
const DONE_KEY = "oc-walkthrough-done";

export default function Walkthrough({ force = false, job = "job", clients = "customers" }: { force?: boolean; job?: string; clients?: string }) {
  const steps: Step[] = useMemo(() => [
    { title: "Welcome to Oatcake", text: "A quick look around. It takes about twenty seconds." },
    { target: "summary", title: "What needs you", text: `One line telling you what to start now and what's due this week.` },
    { target: "list", title: "Your next move, at the top", text: `Every open ${job}, ordered by when to start it, worked back from the deadline. Tap one to move it on, add notes or send a quote.` },
    { target: "layout", title: "List or board", text: `Prefer columns? The board shows every ${job} by stage.` },
    { target: "new", title: `Add a ${job}`, text: `Add a ${job} the moment it comes in. New ${clients} are saved for you.` },
    { target: "ask", title: "Ask Oatcake", text: "Stuck, or after a quick answer? Ask about your jobs, money or how to do something." },
    { target: "me", title: "Make it yours", text: `Settings, your photo, light or dark, and sign out are all in here. Settings holds your stages, the ${job} form and your quote style.` },
  ], [job, clients]);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // First visit only, unless asked to replay. Remembered on the account, with this device as a backup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!force) {
        try {
          if (localStorage.getItem(DONE_KEY)) return;
        } catch {}
        const { data } = await createClient().auth.getUser();
        if (data.user?.user_metadata?.walkthrough_done) return;
      }
      await new Promise((r) => setTimeout(r, 700));
      if (!cancelled) setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [force]);

  const find = useCallback((step: Step) => {
    const keys = step.target ? ([] as string[]).concat(step.target) : [];
    for (const k of keys) {
      for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${k}"]`)) {
        const r = el.getBoundingClientRect();
        if (r.width > 4 && r.height > 4) return el;
      }
    }
    return null;
  }, []);

  // Skip any stop whose part of the page isn't showing (an empty summary, say).
  const usable = steps.filter((s) => !s.target || (typeof document !== "undefined" && open && find(s)));
  const step = usable[Math.min(i, usable.length - 1)];
  const last = i >= usable.length - 1;

  useLayoutEffect(() => {
    if (!open || !step) return;
    const el = find(step);
    if (!el) return setRect(null);
    const fixed = getComputedStyle(el).position === "fixed" || el.closest(".tabbar, .bar");
    if (!fixed) el.scrollIntoView({ block: "center", behavior: "smooth" });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(el.getBoundingClientRect()));
    };
    const t = setTimeout(measure, fixed ? 0 : 380);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step, find]);

  const finish = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {}
    createClient().auth.updateUser({ data: { walkthrough_done: true } });
    if (force) router.replace("/queue");
  }, [force, router]);

  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, usable.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, finish, usable.length]);

  // Where the card sits: under the highlighted part if there's room, otherwise above it.
  const PAD = 8;
  const hole = step?.target && rect ? { x: rect.left - PAD, y: rect.top - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 } : null;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const cardW = Math.min(340, vw - 32);
  let cardStyle: React.CSSProperties = { left: (vw - cardW) / 2, top: vh / 2 - 90, width: cardW };
  if (hole) {
    const below = vh - (hole.y + hole.h);
    const left = Math.max(16, Math.min(vw - cardW - 16, hole.x + hole.w / 2 - cardW / 2));
    cardStyle =
      below > 200 || below > hole.y
        ? { left, top: Math.min(hole.y + hole.h + 14, vh - 190), width: cardW }
        : { left, bottom: vh - hole.y + 14, width: cardW };
  }

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && step && (
          <motion.div className="walk" key="walk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <motion.div
              className="walk-hole"
              aria-hidden="true"
              initial={false}
              animate={
                hole
                  ? { left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: 14 }
                  : { left: vw / 2, top: vh / 2, width: 0, height: 0, borderRadius: 40 }
              }
              transition={SPRING}
            />
            <motion.div
              ref={cardRef}
              tabIndex={-1}
              className="walk-card"
              role="dialog"
              aria-modal="true"
              aria-label="A quick look around Oatcake"
              style={cardStyle}
              layout
              transition={SPRING}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                  transition={SOFT}
                >
                  <b>{step.title}</b>
                  <p>{step.text}</p>
                </motion.div>
              </AnimatePresence>
              <div className="walk-foot">
                <div className="walk-dots" aria-hidden="true">
                  {usable.map((_, n) => (
                    <span key={n}>{n === i && <motion.i layoutId="walk-dot" transition={SPRING} />}</span>
                  ))}
                </div>
                {!last && <button type="button" className="link walk-skip" onClick={finish}>Skip</button>}
                <motion.button type="button" className="btn small" whileTap={{ scale: 0.96 }} onClick={() => (last ? finish() : setI(i + 1))}>
                  {i === 0 ? "Show me" : last ? "Done" : "Next"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
