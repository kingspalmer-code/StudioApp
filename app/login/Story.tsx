"use client";

import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import OatcakeBiscuit from "@/components/OatcakeBiscuit";
import { NavIcon } from "@/components/NavIcons";

// What sits under the sign-in on oatcake.xyz: scroll down and it shows what Oatcake is. A loud
// orange poster with phones over huge type, big coloured rows a feature each, a bento phone with
// hand-drawn notes, and a short letter to finish. The phones are drawn in code with made-up
// content, so nobody's real jobs end up on the open web.
// Hidden in the Mac app and on Home Screen icons (story.css), where the sign-in is all you want.

const ease = [0.2, 0.8, 0.2, 1] as const;

function Rise({ children, delay = 0, className, x = 0 }: { children: React.ReactNode; delay?: number; className?: string; x?: number }) {
  const still = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={still ? false : { opacity: 0, y: x ? 0 : 40, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.8, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

function Spark() {
  return (
    <svg className="st-spark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c.6 5.2 4.8 9.4 10 10-5.2.6-9.4 4.8-10 10-.6-5.2-4.8-9.4-10-10 5.2-.6 9.4-4.8 10-10Z" />
    </svg>
  );
}

function Phone({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.ComponentProps<typeof motion.div>["style"] }) {
  return (
    <motion.div className={["st-phone", className].filter(Boolean).join(" ")} style={style}>
      <div className="st-screen">
        <div className="st-status">
          <span>9:41</span>
          <i />
        </div>
        {children}
      </div>
    </motion.div>
  );
}

const Tick = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 12.5l4 4 8-9" />
  </svg>
);

// Today as colour blocks joined by little notches, on the dark body of the phone.
function TodayScreen() {
  return (
    <div className="st-bento">
      <div className="b lime">
        <small>Tuesday</small>
        <b>Morning, you.</b>
      </div>
      <div className="b pink row">
        <span className="st-check on">
          <Tick />
        </span>
        Finish the poster layout
      </div>
      <div className="b sky notch">
        <small>Up to three things</small>
        <p className="st-line">
          <span className="st-check" />
          Call the printer back
        </p>
        <p className="st-line">
          <span className="st-check" />
          Walk, outside, no phone
        </p>
      </div>
      <div className="b mint notch">
        <small>Focus</small>
        <b className="st-timer">24:10</b>
      </div>
      <div className="b dark-pill">Nothing is overdue. Ever.</div>
    </div>
  );
}

// Tell Oatcake: a messy thought, turned into cards.
function CardsScreen() {
  const cards = [
    ["Send the shot list", "#9ec3e6"],
    ["Invoice the café", "#f2e33c"],
    ["Book the van", "#ff7a45"],
    ["Gold spray paint", "#dfe6dc"],
  ];
  return (
    <div className="st-cardscreen">
      <div className="st-dump">
        <small>Tell Oatcake</small>
        shot list before thurs, invoice the café, van still not booked?? gold spray paint
      </div>
      <div className="st-cards">
        {cards.map(([t, c]) => (
          <div key={t} className="st-card" style={{ background: c }}>
            {t}
            <i />
          </div>
        ))}
      </div>
    </div>
  );
}

function Poster() {
  const ref = useRef<HTMLElement>(null);
  const still = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const upA = useTransform(scrollYProgress, [0, 1], still ? [0, 0] : [120, -120]);
  const upB = useTransform(scrollYProgress, [0, 1], still ? [0, 0] : [220, -200]);
  const tilt = useTransform(scrollYProgress, [0, 1], still ? [-14, -14] : [-4, -22]);
  return (
    <section ref={ref} className="st-poster">
      <div className="st-poster-top">
        <Rise>
          <p className="st-kick">
            <Spark /> Making life easier.
          </p>
          <p className="st-small">For life and work. Oatcake is a calm home for your day, your jobs and your clients. Shaped around neurodivergent brains, and kind to every brain.</p>
        </Rise>
      </div>
      <div className="st-poster-stage">
        <h2 className="st-huge" aria-label="Productivity doesn't need to be boring.">
          <span>Productivity</span>
          <span>doesn&apos;t need</span>
          <span>to be boring.</span>
        </h2>
        <Phone className="st-phone-a" style={{ y: upA }}>
          <TodayScreen />
        </Phone>
        <Phone className="st-phone-b" style={{ y: upB, rotate: tilt }}>
          <CardsScreen />
        </Phone>
      </div>
      <div className="st-poster-foot">
        <Rise>
          <p className="st-kick">
            <Spark /> Get it out of your head!
          </p>
          <p className="st-small">Type it how it comes out. Typos, run-ons, three things at once. Oatcake turns it into cards you can move around, and asks before it guesses.</p>
        </Rise>
      </div>
    </section>
  );
}

// The opening line lights up a word at a time as you scroll past it.
const LINE = "Your brain has a lot of tabs open. Oatcake closes a few, keeps the rest somewhere safe, and never tells you off.".split(" ");

function Word({ word, i, progress }: { word: string; i: number; progress: MotionValue<number> }) {
  const start = (i / LINE.length) * 0.8;
  const opacity = useTransform(progress, [start, start + 0.1], [0.15, 1]);
  return <motion.span style={{ opacity }}>{word} </motion.span>;
}

function Line() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.75", "end 0.6"] });
  return (
    <section ref={ref} className="st-line-sec">
      <h2>
        {LINE.map((w, i) => (
          <Word key={i} word={w} i={i} progress={scrollYProgress} />
        ))}
      </h2>
    </section>
  );
}

// One big coloured row per part of Oatcake.
const ROWS = [
  { n: 1, t: "Today", s: "Three things, not forty", d: "Pick up to three. Start a focus timer if it helps. The rest waits quietly.", c: "#ffd45c", icon: "/today" },
  { n: 2, t: "Tell Oatcake", s: "Brain dump, sorted", d: "Say it messy. It comes back as cards, steps and days.", c: "#c8b8b1", icon: "/admin/support" },
  { n: 3, t: "Habits", s: "Misses are allowed", d: "Slide to log. A miss pauses a streak, never resets it.", c: "#ffbdee", icon: "/habits" },
  { n: 4, t: "Jobs", s: "No wall of tickets", d: "Every job from first message to invoice, on a list or a board.", c: "#8aa4dd", icon: "work" },
  { n: 5, t: "Clients", s: "Only what they need", d: "A link to ask for work, follow it, and approve drafts.", c: "#5b7046", icon: "/customers" },
];

function Rows() {
  return (
    <section className="st-rows">
      {ROWS.map((r, i) => (
        <Rise key={r.n} className="st-row" x={i % 2 ? 60 : -60}>
          <div className="st-row-in" style={{ background: r.c }}>
            <span className="st-num">{r.n}</span>
            <h3>{r.t}</h3>
            <div className="st-row-text">
              <b>{r.s}</b>
              <span>{r.d}</span>
            </div>
            <span className="st-row-icon">
              <NavIcon href={r.icon} strokeWidth={1.5} />
            </span>
          </div>
        </Rise>
      ))}
    </section>
  );
}

// A phone of habits with hand-drawn notes pointing at it.
function Scribble({ d, className }: { d: string; className: string }) {
  const still = useReducedMotion();
  return (
    <motion.svg className={className} viewBox="0 0 120 80" aria-hidden="true">
      <motion.path
        d={d}
        initial={still ? false : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease, delay: 0.4 }}
      />
    </motion.svg>
  );
}

function Notebook() {
  const cells = "11011011101110111110101111011011".split("");
  return (
    <section className="st-note">
      <Rise className="st-note-copy">
        <p className="st-kick">
          <Spark /> Tactile, not technical
        </p>
        <h2>Feels like a notebook. Works like a business.</h2>
        <p className="st-small">Slide to log a habit, drag a card to Thursday, tick a job along. Little physical moves instead of forms with forty boxes.</p>
      </Rise>
      <div className="st-note-stage">
        <Rise>
          <Phone className="st-phone-c">
            <div className="st-bento">
              <div className="b mint">
                <small>Habits today</small>
                <b className="st-timer">2/4</b>
              </div>
              <div className="b pink notch">
                <small>A kinder goal?</small>
                <p className="st-kind">Yoga missed twice. Make it easier for a bit?</p>
                <div className="st-pills">
                  <span>Keep it</span>
                  <span className="on">Ease off</span>
                </div>
              </div>
              <div className="b lime notch">
                <small>Running</small>
                <div className="st-grid">
                  {cells.map((c, i) => (
                    <i key={i} className={c === "1" ? "on" : undefined} />
                  ))}
                </div>
              </div>
              <div className="b sky slide">
                <span className="st-knob">
                  <Tick />
                </span>
                Slide to log water
              </div>
            </div>
          </Phone>
        </Rise>
        <p className="st-hand st-hand-a">slide it, don&apos;t type it</p>
        <Scribble className="st-arrow st-arrow-a" d="M8 10 C 40 6, 80 20, 104 62 M 92 58 L 104 64 L 106 50" />
        <p className="st-hand st-hand-b">no red. ever.</p>
        <Scribble className="st-arrow st-arrow-b" d="M112 12 C 80 10, 40 26, 16 60 M 14 46 L 15 61 L 29 58" />
      </div>
    </section>
  );
}

function Letter() {
  return (
    <section className="st-letter">
      <Rise>
        <OatcakeBiscuit className="st-biscuit" />
        <p className="st-made">
          Made for <span>busy brains</span>, neurodivergent or not
        </p>
        <div className="st-mono">
          <p>hey friend</p>
          <p>most planners are built for people who already feel organised. oatcake is for everyone else too: a great idea in the shower, three half-done jobs, a client waiting and a life to get on with.</p>
          <p>it won&apos;t shout, it won&apos;t go red, and it&apos;s fine if you disappear for a week.</p>
          <p className="st-blue">come back whenever</p>
        </div>
        <a className="st-start" href="/login?start=1">
          Let&apos;s start
        </a>
        <a className="st-signin" href="#top">
          I already have an account
        </a>
      </Rise>
    </section>
  );
}

export default function Story() {
  return (
    <div className="st">
      <Poster />
      <Line />
      <Rows />
      <Notebook />
      <Letter />
    </div>
  );
}
