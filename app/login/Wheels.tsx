"use client";

import { motion, MotionConfig } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const DOES = [
  "projects",
  "to-do lists",
  "quotes",
  "invoices",
  "client requests",
  "job tracking",
  "briefs",
  "file delivery",
  "client portals",
  "planning your day",
];

const FOR = [
  "graphic designers",
  "florists",
  "signwriters",
  "tattoo studios",
  "photographers",
  "bakeries",
  "illustrators",
  "print shops",
  "joiners",
  "wedding planners",
  "hair salons",
  "web studios",
  "interior designers",
  "videographers",
  "cake makers",
  "caterers",
  "screen printers",
  "embroiderers",
  "potters",
  "furniture makers",
  "event planners",
  "copywriters",
  "jewellers",
  "upholsterers",
  "brand studios",
  "mural artists",
  "garden designers",
  "tailors",
  "letterpress studios",
  "architects",
];

const ROW = 28;
const spring = { type: "spring", stiffness: 170, damping: 24, mass: 0.9 } as const;

// A word that turns over by itself like an alarm-clock picker: the current word rolls up and
// away as the next rolls in from below, and the space it takes eases to fit each word.
function Wheel({ items, every, delay }: { items: string[]; every: number; delay: number }) {
  const [at, setAt] = useState(0);
  const [widths, setWidths] = useState<number[] | null>(null);
  const sizer = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const measure = () => setWidths(Array.from(sizer.current?.children ?? [], (el) => (el as HTMLElement).offsetWidth));
    measure();
    document.fonts?.ready.then(measure);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      setAt((n) => n + 1);
      timer = setInterval(() => {
        if (!document.hidden) setAt((n) => n + 1);
      }, every);
    }, delay);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [every, delay]);

  const n = items.length;
  return (
    <motion.span
      className="wheel"
      initial={false}
      style={widths ? { width: widths[0] } : undefined}
      animate={widths ? { width: widths[at % n] } : undefined}
      transition={spring}
    >
      <span className="wheel-size" ref={sizer}>
        {items.map((w) => <span key={w}>{w}</span>)}
      </span>
      {items.map((w, i) => {
        // Rows from the current word, wrapped so the list loops round like a drum.
        let d = (((i - at) % n) + n) % n;
        if (d > n / 2) d -= n;
        const near = Math.abs(d) <= 1;
        return (
          <motion.span
            key={w}
            className="wheel-item"
            initial={false}
            animate={{ y: d * ROW, rotateX: d * -60, opacity: d === 0 ? 1 : 0 }}
            transition={near ? spring : { duration: 0 }}
          >
            {w}
          </motion.span>
        );
      })}
    </motion.span>
  );
}

export default function Wheels() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="login-wheels">
        <p className="sr-only">
          Oatcake is one place for projects, to-do lists, quotes, invoices and client requests, built for small creative businesses and trades.
        </p>
        <span className="wheel-pair" aria-hidden="true">
          <span className="wheel-label">One place for</span>
          <Wheel items={DOES} every={2600} delay={1400} />
        </span>
        <span className="wheel-pair" aria-hidden="true">
          <span className="wheel-label">Built for</span>
          <Wheel items={FOR} every={2200} delay={2500} />
        </span>
      </div>
    </MotionConfig>
  );
}
