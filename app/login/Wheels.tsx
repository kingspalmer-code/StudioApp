"use client";

import { motion, MotionConfig } from "motion/react";
import { useEffect, useState } from "react";

const DOES = [
  "busy heads",
  "projects",
  "to-do lists",
  "habits",
  "brain dumps",
  "focus time",
  "quotes",
  "invoices",
  "client requests",
  "job tracking",
  "briefs",
  "file delivery",
  "client portals",
  "daily plans",
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
// away as the next rolls in from below, centred in a column that never changes size.
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
    </span>
  );
}

export default function Wheels() {
  // On a first visit the wheels blur in after the logo (see LoginIntro), so they wait a little
  // longer before their first turn. The class is still on the page when this first renders.
  const [intro] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("oc-intro"));
  const wait = intro ? 1300 : 0;
  return (
    <MotionConfig reducedMotion="user">
      <div className="login-wheels">
        <p className="sr-only">
          Oatcake is one place for projects, to-do lists, quotes, invoices and client requests, built for small creative businesses and trades.
        </p>
        <span className="wheel-label" aria-hidden="true">One place for</span>
        <Wheel items={DOES} every={2600} delay={1400 + wait} />
        <span className="wheel-label" aria-hidden="true">Built for</span>
        <Wheel items={FOR} every={2200} delay={2500 + wait} />
      </div>
    </MotionConfig>
  );
}
