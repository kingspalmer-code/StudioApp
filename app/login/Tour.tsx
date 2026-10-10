"use client";

import { AnimatePresence, LayoutGroup, motion, MotionConfig, useReducedMotion, type PanInfo } from "motion/react";
import { useEffect, useState } from "react";

// A short look at Oatcake for people tapping "Get started", before they make an account.
// Each card shows a small piece of the real app moving on its own, rather than an illustration.
// Motion uses springs throughout; with Reduce Motion on, things fade and the demos sit still.
const SPRING = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;
const SOFT = { type: "spring", stiffness: 170, damping: 26 } as const;

const SLIDES = [
  {
    title: "Every job, one place.",
    text: "No more digging through emails, WhatsApps and notes to find where things are up to.",
    Demo: BoardDemo,
  },
  {
    title: "Clients ask properly.",
    text: "Requests arrive with everything you need, not just “can you do us a poster?”",
    Demo: RequestDemo,
  },
  {
    title: "Know what to start today.",
    text: "Oatcake works back from each deadline, so nothing sneaks up on you.",
    Demo: QueueDemo,
  },
  {
    title: "Quotes & invoices, sorted.",
    text: "Send a quote from your phone, designed by Oatcake with your logo. Turn it into an invoice when the job's done.",
    Demo: InvoiceDemo,
  },
  {
    title: "Make it yours.",
    text: "Designers, signwriters, photographers: tell Oatcake how you work and it sets itself up to match.",
    Demo: YoursDemo,
  },
];

export default function Tour({ onDone }: { onDone: () => void }) {
  const [[i, dir], setPage] = useState<[number, number]>([0, 1]);
  const last = i === SLIDES.length - 1;
  const go = (n: number) => {
    if (n < 0 || n >= SLIDES.length || n === i) return;
    setPage([n, n > i ? 1 : -1]);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const swipe = info.offset.x + info.velocity.x * 0.2;
    if (swipe < -60) go(i + 1);
    else if (swipe > 60) go(i - 1);
  };
  const { title, text, Demo } = SLIDES[i];

  return (
    <MotionConfig reducedMotion="user">
      <div className="tour">
        <button type="button" className="tour-skip" onClick={onDone}>Skip</button>
        <motion.div className="tour-track" drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18} onDragEnd={onDragEnd}>
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div
              key={i}
              className="tour-slide"
              custom={dir}
              variants={{
                enter: (d: number) => ({ x: d * 80, opacity: 0, scale: 0.96 }),
                center: { x: 0, opacity: 1, scale: 1 },
                exit: (d: number) => ({ x: d * -80, opacity: 0, scale: 0.96 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={SPRING}
            >
              <motion.div
                className="tour-stage"
                aria-hidden="true"
                initial={{ boxShadow: "0 0 0 rgba(0,0,0,0)" }}
                animate={{ boxShadow: "0 24px 60px rgba(0,0,0,.45)" }}
                transition={{ duration: 0.8 }}
              >
                <Demo />
              </motion.div>
              <h2 className="tour-title" aria-live="polite">
                <Words text={title} />
              </h2>
              <motion.p className="tour-text" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.25 }}>
                {text}
              </motion.p>
              {last && (
                <motion.p className="tour-small" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
                  Made for small studios and trades, not big teams. Set up in two minutes.
                </motion.p>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <div className="tour-dots" role="tablist" aria-label="Tour">
          {SLIDES.map((s, n) => (
            <button key={n} type="button" role="tab" aria-selected={n === i} aria-label={s.title} onClick={() => go(n)}>
              {n === i && <motion.span layoutId="tour-dot" className="tour-dot-on" transition={SPRING} />}
            </button>
          ))}
        </div>
        <motion.button type="button" className="btn wide" onClick={last ? onDone : () => go(i + 1)} whileTap={{ scale: 0.97 }}>
          {last ? "Create your account" : "Next"}
        </motion.button>
      </div>
    </MotionConfig>
  );
}

// Headline words drift up and sharpen in, one after another.
function Words({ text }: { text: string }) {
  return text.split(" ").map((w, n) => (
    <motion.span
      key={`${w}-${n}`}
      className="tour-word"
      initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ ...SOFT, delay: 0.06 * n }}
    >
      {w}
    </motion.span>
  ));
}

// Steps through 0..count-1 on a timer; sits on the last step when Reduce Motion is on.
function useLoop(count: number, ms: number) {
  const still = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (still) return;
    const t = setInterval(() => setStep((s) => (s + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms, still]);
  return still ? count - 1 : step;
}

function BoardDemo() {
  const at = useLoop(5, 1500); // the moving job sits in column 0..3, then pauses in Delivered
  const cols = [
    { label: "New", color: "blue", cards: ["Gift vouchers"] },
    { label: "In progress", color: "indigo", cards: ["Spring menu"] },
    { label: "With client", color: "purple", cards: ["Logo refresh"] },
    { label: "Delivered", color: "green", cards: ["Beer mats"] },
  ];
  const col = Math.min(at, 3);
  return (
    <LayoutGroup>
      <div className="demo-board">
        {cols.map((c, n) => (
          <div className="demo-col" key={c.label}>
            <b><i style={{ background: `var(--t-${c.color})` }} />{c.label}</b>
            {n === col && (
              <motion.div layoutId="mover" className="demo-card mover" transition={SPRING}>
                Halloween poster<small>Due Fri</small>
              </motion.div>
            )}
            {c.cards.map((t) => (
              <motion.div layout="position" className="demo-card" key={t} transition={SPRING}>{t}</motion.div>
            ))}
          </div>
        ))}
      </div>
    </LayoutGroup>
  );
}

function Typed({ text, from, step }: { text: string; from: number; step: number }) {
  const shown = Math.max(0, Math.min(text.length, (step - from) * 3));
  return <span>{text.slice(0, shown)}{shown > 0 && shown < text.length && <i className="caret" />}</span>;
}

function RequestDemo() {
  const step = useLoop(34, 160); // type the request, press send, then it lands in the queue
  const sent = step >= 20;
  return (
    <LayoutGroup>
      <div className="demo-request">
        <AnimatePresence mode="popLayout">
          {!sent ? (
            <motion.div key="form" className="demo-form" exit={{ opacity: 0, scale: 0.96, filter: "blur(4px)" }} transition={SPRING}>
              <div className="demo-field">
                <small>What do you need?</small>
                <Typed text="Christmas menu, A4" from={1} step={step} />
              </div>
              <div className="demo-field"><small>Deadline</small><Typed text="Fri 12 Dec" from={8} step={step} /></div>
              <div className="demo-field"><small>Exact wording</small><Typed text="3 courses £32.50" from={12} step={step} /></div>
              <motion.div className="demo-send" animate={{ scale: step === 18 || step === 19 ? 0.92 : 1 }} transition={SPRING}>Send request</motion.div>
            </motion.div>
          ) : (
            <motion.div key="list" className="demo-list">
              <motion.div
                className="demo-row fresh"
                initial={{ opacity: 0, y: -26, scale: 0.94, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
              >
                <span>Christmas menu, A4<small>The Brewery Tap · due Fri 12 Dec</small></span><em className="new">New</em>
              </motion.div>
              <motion.div className="demo-row" initial={{ y: -44 }} animate={{ y: 0 }} transition={SPRING}><span>Gin festival banner<small>HopRocket</small></span><em>In progress</em></motion.div>
              <motion.div className="demo-row" initial={{ y: -44 }} animate={{ y: 0 }} transition={{ ...SPRING, delay: 0.03 }}><span>Staff rota poster<small>Queens</small></span><em>With client</em></motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

function QueueDemo() {
  const step = useLoop(4, 1400); // the urgent job arrives and the queue makes room for it
  const rows = [
    ...(step >= 1 ? [{ k: "u", t: "Beer festival banner", s: "Urgent · due Mon", w: "Start today", c: "hot" }] : []),
    { k: "a", t: "Van livery", s: "5 days’ work · due Thu", w: "Start today", c: "hot" },
    { k: "b", t: "Autumn menu", s: "3 days’ work · due Fri", w: "Start tomorrow", c: "warm" },
    { k: "c", t: "A-board", s: "2 days’ work · due next Wed", w: "Start Mon", c: "" },
  ];
  return (
    <div className="demo-list demo-queue">
      <AnimatePresence initial={false} mode="popLayout">
        {rows.map((r) => (
          <motion.div
            key={r.k}
            layout
            className={`demo-row${r.k === "u" ? " urgent" : ""}`}
            initial={{ opacity: 0, y: -24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
          >
            <span>{r.t}<small>{r.s}</small></span><em className={r.c}>{r.w}</em>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function InvoiceDemo() {
  const step = useLoop(20, 400); // lines fill in, send it, then it becomes an invoice and gets paid
  const lines: [string, string][] = [
    ["Fascia design", "£180.00"],
    ["Aluminium panel", "£520.00"],
    ["Gold leaf lettering", "£350.00"],
  ];
  const invoice = step >= 12;
  const kind = invoice ? "INVOICE" : "QUOTE";
  return (
    <div className="demo-invoice">
      <div className="demo-doc">
        <div className="demo-doc-head">
          <b><i />Ashwell Signs</b>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={kind}
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={SOFT}
            >
              {kind}
            </motion.span>
          </AnimatePresence>
        </div>
        {lines.map(([t, p], n) =>
          step >= n + 1 ? (
            <motion.div
              key={t}
              className="demo-doc-line"
              initial={{ opacity: 0, x: -10, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={SOFT}
            >
              <span>{t}</span><span>{p}</span>
            </motion.div>
          ) : (
            <div key={t} className="demo-doc-line empty" />
          )
        )}
        <motion.div className="demo-doc-total" animate={{ opacity: step >= 4 ? 1 : 0, y: step >= 4 ? 0 : 6 }} transition={SOFT}>
          <span>{invoice ? "Amount due" : "Total"}</span><span>£1,050.00</span>
        </motion.div>
        <AnimatePresence>
          {step >= 14 && (
            <motion.div
              className="demo-paid"
              initial={{ opacity: 0, scale: 1.8, rotate: -4 }}
              animate={{ opacity: 1, scale: 1, rotate: -12 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 16 }}
            >
              Paid
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        {step >= 8 && step < 12 ? (
          <motion.div
            key="sent"
            className="demo-toast"
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
          >
            ✓ Sent to The Brewery Tap
          </motion.div>
        ) : (
          <motion.div
            key="send"
            className="demo-send"
            initial={{ opacity: 0 }}
            animate={{ opacity: step >= 5 && step < 12 ? 1 : 0, scale: step === 6 || step === 7 ? 0.92 : 1 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
          >
            Email to customer
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function YoursDemo() {
  const step = useLoop(4, 1600);
  const yours = step >= 1 && step <= 2;
  const stages: [string, string, string, string][] = [
    ["New", "Quote sent", "blue", "orange"],
    ["In progress", "Building", "indigo", "purple"],
    ["Delivered", "Fitted", "green", "green"],
  ];
  return (
    <div className="demo-yours">
      <div className="demo-pills">
        {stages.map(([a, b, ca, cb]) => (
          <span className="demo-pill" key={a}>
            <motion.i animate={{ background: `var(--t-${yours ? cb : ca})` }} />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={yours ? b : a}
                initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                transition={SOFT}
              >
                {yours ? b : a}
              </motion.span>
            </AnimatePresence>
          </span>
        ))}
      </div>
      <motion.div layout className="demo-form" transition={SPRING}>
        <motion.div layout className="demo-field" transition={SPRING}><small>{yours ? "Job notes" : "Brief"}</small><span>Gold leaf, double-sided</span></motion.div>
        <motion.div layout className="demo-field" transition={SPRING}><small>{yours ? "Site address" : "Deadline"}</small><span>{yours ? "14 High St, Leek" : "Fri 12 Dec"}</span></motion.div>
        <AnimatePresence initial={false}>
          {yours && (
            <motion.div
              layout
              key="quote"
              className="demo-field added"
              initial={{ opacity: 0, scale: 0.9, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <small>Quote (£)</small><span>£850</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
