"use client";

import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef, useState } from "react";
import OatcakeBiscuit from "@/components/OatcakeBiscuit";
import { NavIcon } from "@/components/NavIcons";

// What sits under the sign-in on oatcake.xyz: scroll down and it shows what Oatcake is. A loud
// orange poster, big coloured rows a feature each, a habits phone with hand-drawn notes, the
// business tools, and a short letter to finish. The phones copy the real screens but are drawn in
// code with made-up content, so nobody's real jobs end up on the open web.
// Things fade and rise in as they arrive. Only the line of words is tied to the scroll position;
// iPhone Safari resizes the page as its bar hides, which made scroll-linked phones jump.
// Hidden in the Mac app and on Home Screen icons (story.css), where the sign-in is all you want.

const ease = [0.2, 0.8, 0.2, 1] as const;

function Rise({ children, delay = 0, className, rotate = 0 }: { children: React.ReactNode; delay?: number; className?: string; rotate?: number }) {
  const still = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={still ? false : { opacity: 0, y: 48, rotate: rotate * 0.4 }}
      whileInView={{ opacity: 1, y: 0, rotate }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.9, ease, delay }}
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

function Phone({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div className={light ? "st-phone light" : "st-phone"}>
      <div className="st-screen">
        <div className="st-status">
          <span>9:41</span>
          <i />
        </div>
        {children}
      </div>
    </div>
  );
}

const Tick = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 12.5l4 4 8-9" />
  </svg>
);

// To-do as cards, like the real Cards view.
function TodoScreen() {
  return (
    <div className="st-app">
      <p className="st-app-title">Friday</p>
      <p className="st-app-date">23 October</p>
      <div className="st-tiles">
        <div className="st-tile yellow">
          <small>Done today</small>
          <b>2</b>
          <span className="st-bar">
            <i style={{ width: "60%" }} />
          </span>
        </div>
        <div className="st-tile ink">
          <small>Next up</small>
          <b className="st-tile-next">Print proofs</b>
          <span>Today · 14:00</span>
        </div>
      </div>
      <div className="st-chips">
        <span className="on">All</span>
        <span>
          <i style={{ background: "#9ec3e6" }} />
          Shop launch
        </span>
        <span>
          <i style={{ background: "#ff6a3d" }} />
          Home
        </span>
      </div>
      <p className="st-group">
        Shop launch <small>3</small>
      </p>
      <div className="st-cardgrid">
        <div className="st-card" style={{ background: "#9ec3e6" }}>
          <span className="st-date">Mon 26 Oct</span>
          Send the shot list
          <i />
        </div>
        <div className="st-card" style={{ background: "#dfe6dc" }}>
          Gold spray paint
          <i />
        </div>
        <div className="st-card wide" style={{ background: "#9ec3e6" }}>
          <span className="st-date">Tue 27 Oct · 08:00</span>
          <b>Window photoshoot</b>
          <span className="st-place">The Corner Café</span>
          <i />
        </div>
      </div>
      <p className="st-group">
        Home <small>2</small>
      </p>
      <div className="st-cardgrid">
        <div className="st-card" style={{ background: "#ff6a3d" }}>
          Book the van
          <i />
        </div>
        <div className="st-card" style={{ background: "#b9aedc" }}>
          Call Mum back
          <i />
        </div>
      </div>
    </div>
  );
}

// Tell Oatcake: a messy thought in the box, tidy rows ready to add.
function TellScreen() {
  const rows = [
    ["On the calendar", "Shot list to the café", "Thu"],
    ["To-do", "Invoice the café", "Today"],
    ["To-do", "Book the van", "Any time"],
    ["To get", "Gold spray paint", ""],
  ];
  return (
    <div className="st-app">
      <p className="st-app-title">To-do</p>
      <div className="st-tell">
        <span className="st-tell-label">
          <OatcakeBiscuit className="st-tell-mark" small />
          Tell Oatcake
        </span>
        shot list to the café before thurs, invoice them, van STILL not booked?? oh and gold spray paint
      </div>
      <div className="st-tell-rows">
        {rows.map(([kind, title, when]) => (
          <div key={title} className="st-tell-row">
            <small>{kind}</small>
            <b>{title}</b>
            {when && <span>{when}</span>}
          </div>
        ))}
      </div>
      <div className="st-tell-ask">
        <p>Is the van for Thursday too?</p>
        <div>
          <span>Yes, Thursday</span>
          <span>No rush</span>
        </div>
      </div>
      <span className="st-add">Add 4 things</span>
    </div>
  );
}

// The headline gets a screen to itself and stays put while you scroll; once it has had a moment
// the phones rise in over it, poster style, and drop away again if you scroll back up. The scroll
// only flips them on or off and the move itself plays on its own clock, so Safari's bar resizing
// the page can't make them jump.
function Poster() {
  const stage = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  const [up, setUp] = useState(false);
  const { scrollYProgress } = useScroll({ target: stage, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => setUp((was) => (was ? v > 0.2 : v > 0.32)));
  const show = up || !!still;
  const phone = (side: "a" | "b") => ({
    initial: false as const,
    animate: show ? { opacity: 1, y: 0, rotate: side === "a" ? -9 : 8 } : { opacity: 0, y: 420, rotate: side === "a" ? -2 : 2 },
    transition: { type: "spring" as const, stiffness: 120, damping: 20, delay: show && side === "b" ? 0.12 : 0 },
  });
  return (
    <section className="st-poster">
      <div className="st-wrap">
        <Rise>
          <p className="st-kick">
            <Spark /> Making life easier.
          </p>
          <p className="st-small">For life and work. Oatcake is a calm home for your day, your jobs and your clients. Shaped around busy lives, with a gentle nudge to stop for a moment and get things organised.</p>
        </Rise>
      </div>
      <div ref={stage} className="st-stage">
        <div className="st-sticky">
          <motion.h2 className="st-huge" animate={{ opacity: show ? 0.92 : 1 }} transition={{ duration: 0.6 }}>
            <span>Productivity</span>
            <span>doesn&apos;t need</span>
            <span>to be boring.</span>
          </motion.h2>
          <motion.div className="st-float-phone a" {...phone("a")}>
            <Phone>
              <TodoScreen />
            </Phone>
          </motion.div>
          <motion.div className="st-float-phone b" {...phone("b")}>
            <Phone>
              <TellScreen />
            </Phone>
          </motion.div>
        </div>
      </div>
      <div className="st-wrap">
        <Rise>
          <p className="st-kick">
            <Spark /> Get it out of your head!
          </p>
          <p className="st-small">Brain dumps, scribbles, half-thoughts at 2am. No more lost notebooks with three pages used. Keep your rambling thoughts in one place and let them work for you.</p>
        </Rise>
      </div>
    </section>
  );
}

// The line lights up a word at a time as you scroll past it.
const LINE = "Your brain has a lot of tabs open. Oatcake keeps them somewhere safe.".split(" ");

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
      <Rise className="st-line-sub" delay={0.2}>
        So your brain can be a little quieter.
      </Rise>
    </section>
  );
}

// One big coloured row per part of the day-to-day side.
const ROWS = [
  { t: "Today", s: "Three things, not forty", d: "Pick up to three. The rest waits quietly in Still on your plate.", c: "#ffd45c", icon: "/today" },
  { t: "Tell Oatcake", s: "Brain dump, sorted", d: "Say it messy. It comes back as to-dos, dates and a shopping list.", c: "#c8b8b1", icon: "/admin/support" },
  { t: "To-do", s: "Cards you can move", d: "Colour-coded cards you drag between days, with a calendar when you need one.", c: "#9ec3e6", icon: "/calendar" },
  { t: "Habits", s: "Set your own bar", d: "Slide to log. Pick goals that fit your week, and ease off when life happens.", c: "#ffbdee", icon: "/habits" },
  { t: "Focus", s: "One thing, one timer", d: "A count-up clock that keeps you company and logs the time for you.", c: "#c6f432", icon: "/apps/job-time" },
];

function Rows() {
  return (
    <section className="st-rows">
      {ROWS.map((r, i) => (
        <Rise key={r.t} className="st-row" delay={i * 0.04}>
          <div className="st-row-in" style={{ background: r.c }}>
            <span className="st-num">{i + 1}</span>
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

// Habits, like the real page, with hand-drawn notes pointing at it.
function Scribble({ d, className }: { d: string; className: string }) {
  const still = useReducedMotion();
  return (
    <svg className={className} viewBox="0 0 120 80" aria-hidden="true">
      <motion.path d={d} initial={still ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease, delay: 0.5 }} />
    </svg>
  );
}

const HABITS = [
  { name: "Running", meta: "2× a week · 20 wk streak", c: "#e8892b", dots: "1000000", done: true },
  { name: "Drink water", meta: "6 glasses · 71 days", c: "#3f7fd0", dots: "1111110", count: "4" },
  { name: "Yoga", meta: "Once a week · 25 wks", c: "#a45aa0", dots: "0000000" },
];

function HabitsScreen() {
  return (
    <div className="st-app">
      <p className="st-app-date caps">Monday 26 Oct</p>
      <p className="st-app-title">Habits</p>
      <div className="st-progress">
        <span>2 of 3 done</span>
        <span className="st-bar">
          <i style={{ width: "66%" }} />
        </span>
      </div>
      <div className="st-kinder">
        <small>A kinder goal?</small>
        <b>Yoga missed 2 times lately</b>
        <p>That&apos;s fine, your streak&apos;s safe. Want to make it easier for a bit?</p>
        <div className="st-kinder-btns">
          <span>Keep it</span>
          <span className="on">Ease off</span>
        </div>
      </div>
      {HABITS.map((h) => (
        <div key={h.name} className="st-habit" style={{ "--c": h.c } as React.CSSProperties}>
          <span className="st-habit-icon" />
          <div>
            <b>{h.name}</b>
            <small>{h.meta}</small>
            <span className="st-dots">
              {h.dots.split("").map((d, i) => (
                <i key={i} className={d === "1" ? "on" : undefined} />
              ))}
            </span>
          </div>
          <span className={h.done ? "st-ring on" : "st-ring"}>{h.done ? <Tick /> : h.count}</span>
        </div>
      ))}
      <div className="st-slide">
        <span className="st-knob">
          <Tick />
        </span>
        Slide to log a glass
      </div>
    </div>
  );
}

function Notebook() {
  return (
    <section className="st-note">
      <Rise className="st-note-copy">
        <p className="st-kick">
          <Spark /> Tactile, not technical
        </p>
        <h2>
          Feels like a notebook.
          <br />
          Works like a business.
        </h2>
        <p className="st-small">Slide to log a habit, drag a card to Thursday, tick a job along. Little physical moves instead of forms with forty boxes.</p>
      </Rise>
      <div className="st-note-stage">
        <p className="st-hand st-hand-a">tap it, don&apos;t type it</p>
        <Scribble className="st-arrow st-arrow-a" d="M8 10 C 40 6, 80 20, 104 62 M 92 58 L 104 64 L 106 50" />
        <Rise>
          <Phone>
            <HabitsScreen />
          </Phone>
        </Rise>
        <p className="st-hand st-hand-b">no red. ever.</p>
        <Scribble className="st-arrow st-arrow-b" d="M112 12 C 80 10, 40 26, 16 60 M 14 46 L 15 61 L 29 58" />
      </div>
    </section>
  );
}

// The business side: a jobs phone with what happens around it floating beside it.
const JOBS = [
  ["Spring menu boards", "The Corner Café", "Ready for review", "#d08ccb"],
  ["Van livery", "Hollins Plumbing", "In progress", "#f0a457"],
  ["Shop fascia", "Bloom Florist", "Quote sent", "#7fa9d6"],
  ["Gig posters", "Northern Room", "New", "#7fa9d6"],
  ["A-board", "The Corner Café", "Finished", "#6fbf7e"],
];

const FLOATS = [
  { tag: "Quote", c: "#ff8a5c", t: "Quote 071 · £480", s: "Sent from your own email, PDF attached" },
  { tag: "Client", c: "#6fbf7e", t: "Draft approved", s: "The Corner Café liked the menu boards" },
  { tag: "Hours", c: "#7fa9d6", t: "3h 20m", s: "Logged on Van livery today" },
  { tag: "Invoice", c: "#f2d54a", t: "Invoice 70 paid", s: "£600 · Bloom Florist" },
  { tag: "Team", c: "#d08ccb", t: "Ellie ticked off", s: "Print the proofs" },
];

const TOOLS = [
  ["work", "Jobs, list or board", "Every job from first message to final invoice. Drag it along when it moves."],
  ["/settings", "Quotes and invoices", "Numbered for you, line items, your logo, sent from your Gmail."],
  ["requests", "Client links", "Clients ask for work properly, follow it and approve drafts. No account needed."],
  ["/apps/job-time", "Hours and estimates", "Timers on every job, and how long the next one will probably take."],
  ["/team", "Your team", "Give an employee a to-do list, a look, or the lot."],
  ["/gallery", "Files and gallery", "Proofs, photos and finished work, kept with the job."],
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = [0, 6, 1, 3, 5, 1, 0, 2, 4, 6, 7, 0, 1, 0, 7, 3, 1, 6, 2, 3, 0, 0, 5, 4, 3, 6, 2, 0];

function Serious() {
  return (
    <section className="st-biz">
      <div className="st-wrap">
        <Rise>
          <p className="st-kick">
            <Spark /> And for the serious bits.
          </p>
          <h2>Proper tools for small teams, solo creators and young studios.</h2>
          <p className="st-small">Quotes, jobs, clients, hours and a team, in the same calm place as your day. Nothing you&apos;d need a training day for.</p>
        </Rise>
      </div>

      <div className="st-biz-stage">
        <Rise className="st-biz-phone">
          <Phone light>
            <div className="st-app light">
              <p className="st-app-title">Jobs</p>
              <div className="st-chips light">
                <span className="on">List</span>
                <span>Board</span>
              </div>
              {JOBS.map(([t, who, stage, c]) => (
                <div key={t} className="st-jobrow" style={{ "--c": c } as React.CSSProperties}>
                  <div>
                    <b>{t}</b>
                    <small>{who}</small>
                  </div>
                  <span>{stage}</span>
                </div>
              ))}
            </div>
          </Phone>
        </Rise>
        {FLOATS.map((f, i) => (
          <Rise key={f.t} className={`st-float f${i}`} delay={0.15 + i * 0.1} rotate={i % 2 ? 3 : -3}>
            <span className="st-float-tag" style={{ background: f.c }}>
              {f.tag}
            </span>
            <b>{f.t}</b>
            <small>{f.s}</small>
          </Rise>
        ))}
      </div>

      <div className="st-wrap">
        <div className="st-tools">
          {TOOLS.map(([icon, t, d], i) => (
            <Rise key={t} className="st-tool" delay={(i % 3) * 0.08}>
              <span className="st-tool-icon">
                <NavIcon href={icon} strokeWidth={1.6} />
              </span>
              <b>{t}</b>
              <span>{d}</span>
            </Rise>
          ))}
        </div>

        <div className="st-pair">
          <Rise className="st-sentence">
            <small>How a job goes</small>
            <p>
              I <u>quote it</u>, <u>make it</u>, <u>send it for review</u> and <u>get paid</u>, without six other apps.
            </p>
            <span className="st-sentence-meta">From first message to invoice</span>
          </Rise>
          <Rise className="st-activity" delay={0.1}>
            <small>Hours this month</small>
            <p className="st-activity-line">Busy Mondays and Thursdays. Fridays are lighter.</p>
            <div className="st-dotgrid">
              {DAYS.map((d) => (
                <span key={d} className="st-dotday">
                  {d}
                </span>
              ))}
              {HOURS.map((h, i) => (
                <span key={i} className="st-dotcell">
                  {h > 0 && <i style={{ width: `${18 + h * 9}%`, height: `${18 + h * 9}%` }} />}
                </span>
              ))}
            </div>
          </Rise>
        </div>
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
      <Serious />
      <Letter />
    </div>
  );
}
