"use client";

import { AnimatePresence, motion, MotionConfig, useReducedMotion, type PanInfo } from "motion/react";
import { useEffect, useRef, useState } from "react";

// A short look at Oatcake for people tapping "Get started", before they make an account.
// Same colourful poster style as the story under the sign-in: each step has its own colour and a small screen of the app moving on its own.
// Motion uses springs throughout; with Reduce Motion on, things fade and the demos sit still.
const SPRING = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;
const SOFT = { type: "spring", stiffness: 170, damping: 26 } as const;

const SLIDES = [
  {
    title: "Get it out of your head.",
    text: "Brain dumps, scribbles, half-thoughts at 2am. Tell Oatcake and it sorts them into cards.",
    color: "#ff5a36",
    Demo: TellDemo,
  },
  {
    title: "Three things today.",
    text: "Not forty. Pick a few, tick them off, and let the rest wait without staring at you.",
    color: "#ffd45c",
    Demo: TodayDemo,
  },
  {
    title: "Habits that bend when life does.",
    text: "Slide to log. Miss a few and Oatcake offers an easier goal, not a guilt trip.",
    color: "#ffbdee",
    Demo: HabitsDemo,
  },
  {
    title: "And the serious bits.",
    text: "Jobs, quotes, invoices and clients for small teams, solo creators and young studios.",
    color: "#8aa4dd",
    Demo: InvoiceDemo,
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
        <motion.div className="tour-bg" aria-hidden="true" initial={false} animate={{ backgroundColor: SLIDES[i].color }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} />
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
                  For life and work. Set up in two minutes.
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

function Typed({ text, from, step }: { text: string; from: number; step: number }) {
  const shown = Math.max(0, Math.min(text.length, (step - from) * 3));
  return <span>{text.slice(0, shown)}{shown > 0 && shown < text.length && <i className="caret" />}</span>;
}

// A messy thought gets typed out, then Oatcake turns it into coloured cards.
function TellDemo() {
  const step = useLoop(44, 140);
  const dump = "dentist thurs?? oat milk. call mum. finish Jo's poster";
  const cards = [
    { t: "Dentist", s: "Thu", c: "sky" },
    { t: "Oat milk", s: "To get", c: "lemon" },
    { t: "Call mum", s: "Any time", c: "pink" },
    { t: "Jo's poster", s: "Work", c: "orange" },
  ];
  const sorted = step >= 24;
  return (
    <div className="demo-tell">
      <div className="demo-dump">
        <small>What&rsquo;s on your mind?</small>
        <Typed text={dump} from={1} step={step} />
      </div>
      <div className="demo-cards">
        <AnimatePresence>
          {sorted && cards.map((c, n) => (
            <motion.div
              key={c.t}
              className={`demo-bento ${c.c}`}
              initial={{ opacity: 0, y: 14, scale: 0.85, rotate: n % 2 ? 3 : -3 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: n % 2 ? 1.5 : -1.5 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 320, damping: 20, delay: 0.12 * n }}
            >
              {c.t}<small>{c.s}</small>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Three things for today get ticked off one by one; the rest stays folded away.
function TodayDemo() {
  const step = useLoop(9, 900);
  const things = ["Reply to Sam", "Walk before lunch", "Send Jo the proofs"];
  return (
    <div className="demo-today">
      <b className="demo-head">Today</b>
      {things.map((t, n) => {
        const done = step >= n * 2 + 2;
        return (
          <motion.div key={t} className={`demo-thing${done ? " done" : ""}`} animate={{ scale: step === n * 2 + 2 ? [1, 1.04, 1] : 1 }} transition={{ duration: 0.4 }}>
            <motion.i animate={{ background: done ? "#6fbf7e" : "rgba(243,233,220,0)" }} transition={SOFT}>
              {done && <svg viewBox="0 0 12 12"><motion.path d="M2.5 6.2 5 8.6 9.6 3.6" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3 }} /></svg>}
            </motion.i>
            <span>{t}</span>
          </motion.div>
        );
      })}
      <motion.p className="demo-nice" animate={{ opacity: step >= 7 ? 1 : 0, y: step >= 7 ? 0 : 6 }} transition={SOFT}>Nice. The rest can wait.</motion.p>
      <div className="demo-plate">Still on your plate &middot; 12</div>
    </div>
  );
}

// Slide the knob to log a glass of water; a missed run offers a kinder goal.
function HabitsDemo() {
  const step = useLoop(7, 1100);
  const logged = step >= 2;
  const glasses = logged ? 4 : 3;
  const track = useRef<HTMLDivElement>(null);
  const far = (track.current?.clientWidth ?? 280) - 40;
  return (
    <div className="demo-habits">
      <div className="demo-habit">
        <svg className="demo-ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" /><motion.circle cx="18" cy="18" r="15" className="on" initial={false} animate={{ pathLength: glasses / 6 }} transition={SOFT} /></svg>
        <span>Drink water<small>{glasses} of 6 glasses</small></span>
      </div>
      <div className="demo-slide" ref={track}>
        <motion.i animate={{ x: step === 1 ? far : 0 }} transition={step === 1 ? { duration: 0.8, ease: [0.4, 0, 0.2, 1] } : SPRING} />
        <span>{logged && step < 4 ? "Logged" : "Slide to log a glass"}</span>
      </div>
      <motion.div className="demo-kind" animate={{ opacity: step >= 4 ? 1 : 0, y: step >= 4 ? 0 : 8 }} transition={SOFT}>
        <span>Running<small>Missed a couple this week</small></span>
        <em>Try 2 instead?</em>
      </motion.div>
    </div>
  );
}

function InvoiceDemo() {
  const step = useLoop(16, 450); // price it up, send the quote, then the invoice, then it's paid
  const lines: [string, string][] = [
    ["Sign design", "£120"],
    ["Painted board, 1.8m", "£340"],
    ["Fitting", "£90"],
  ];
  const [status, tone] =
    step >= 13 ? ["Paid", "ok"] : step >= 11 ? ["Invoice sent", "new"] : step >= 7 ? ["Quote sent", "warm"] : ["Draft", ""];
  const invoice = step >= 9;
  return (
    <div className="demo-invoice">
      <div className="demo-row">
        <span>Shop sign<small>Fernhill Bakery</small></span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.em
            key={status}
            className={tone}
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={SOFT}
          >
            {status}
          </motion.em>
        </AnimatePresence>
      </div>
      <div className="demo-quote">
        {lines.map(([t, p], n) => (
          <motion.div
            key={t}
            className="demo-quote-line"
            animate={step >= n + 1 ? { opacity: 1, x: 0, filter: "blur(0px)" } : { opacity: 0, x: -10, filter: "blur(4px)" }}
            transition={SOFT}
          >
            <span>{t}</span><span>{p}</span>
          </motion.div>
        ))}
        <motion.div
          className={`demo-quote-line total${step >= 13 ? " paid" : ""}`}
          animate={{ opacity: step >= 4 ? 1 : 0, y: step >= 4 ? 0 : 6 }}
          transition={SOFT}
        >
          <span>{invoice ? "Invoice" : "Quote"}</span><span>£550</span>
        </motion.div>
      </div>
      <motion.div
        className="demo-send"
        animate={{ opacity: step >= 5 && step < 13 ? 1 : 0, scale: step === 6 || step === 10 ? 0.92 : 1 }}
        transition={SPRING}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={invoice ? "i" : "q"} initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(4px)" }} transition={SOFT}>
            {invoice ? "Send invoice" : "Send quote"}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
