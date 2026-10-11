"use client";

import { motion, MotionConfig } from "motion/react";
import { useEffect, useState } from "react";

const DOES = [
  "project organisation",
  "to-do lists",
  "quotes",
  "invoices",
  "client requests",
  "job tracking",
  "creative briefs",
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

const ROW = 30;

// One column of an alarm-clock style picker that turns by itself: the chosen word sits in the
// middle, its neighbours tilt away above and below, and every few seconds it rolls on one.
function Wheel({ items, every, delay }: { items: string[]; every: number; delay: number }) {
  const [at, setAt] = useState(0);

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
    <span className="wheel" aria-hidden="true">
      <span className="wheel-size">
        {items.map((w) => <span key={w}>{w}</span>)}
      </span>
      {items.map((w, i) => {
        // Distance from the middle row, wrapped so the list loops round like a drum.
        let d = (((i - at) % n) + n) % n;
        if (d > n / 2) d -= n;
        const off = Math.abs(d) > 1;
        const gone = Math.abs(d) > 2;
        return (
          <motion.span
            key={w}
            className="wheel-item"
            initial={false}
            animate={{
              y: d * ROW,
              rotateX: Math.max(-70, Math.min(70, d * -38)),
              opacity: off ? 0 : d === 0 ? 1 : 0.3,
            }}
            transition={gone ? { duration: 0 } : { type: "spring", stiffness: 170, damping: 22, mass: 0.9 }}
          >
            {w}
          </motion.span>
        );
      })}
    </span>
  );
}

export default function Wheels() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="login-wheels">
        <p className="sr-only">
          Oatcake does project organisation, to-do lists, quotes, invoices and client requests in one place, for small creative businesses and trades.
        </p>
        <span className="wheel-band" aria-hidden="true" />
        <span className="wheel-label" aria-hidden="true">One place for</span>
        <Wheel items={DOES} every={2600} delay={1400} />
        <span className="wheel-band" aria-hidden="true" />
        <span className="wheel-label" aria-hidden="true">Built for</span>
        <Wheel items={FOR} every={1900} delay={2300} />
      </div>
    </MotionConfig>
  );
}
