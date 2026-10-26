"use client";

import Link from "next/link";
import { Silkscreen } from "next/font/google";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { feedPickle } from "@/app/queue/pet";
import { GOLDEN_COST, type PetView } from "@/lib/pet";
import { createClient } from "@/lib/supabase/client";
import Thumb from "./Thumb";

const pixel = Silkscreen({ weight: "400", subsets: ["latin"] });

// The row of widgets above Up next, and on a client's Overview: Pickle the pixel pet (an oatcake
// for every job delivered, or for clients every request sent), the week ahead, the latest finished
// work and this week's tally. Two show at a time; the button
// on the right picks which, and dragging a handle swaps them round. Kept on this computer.
export type WeekDay = { date: string; label: string; today: boolean; jobs: { id: number; title: string; color: string }[] };
export type ReelItem = { id: number; title: string; url: string | null; path: string };
// due and late are null when the workspace works without dates.
export type WeekStats = { delivered: number; due: number | null; late: number | null };

type Key = "pet" | "week" | "reel" | "tally" | "days";
const ALL: { key: Key; title: string; blurb: string }[] = [
  { key: "pet", title: "Pickle", blurb: "Your pixel pet, fed with oatcakes" },
  { key: "week", title: "Week ahead", blurb: "What's due over the next seven days" },
  { key: "reel", title: "Fresh out the oven", blurb: "Your latest finished work" },
  { key: "tally", title: "This week", blurb: "Delivered so far and what's late" },
  { key: "days", title: "Days active", blurb: "How many days each month you used Oatcake" },
];
const SHOWN = 2;
const DEFAULT: Key[] = ["pet", "week"];
const SHOWN_KEY = "widgets_shown";
const TIN_KEY = "pickle_tin";
const LEVEL_KEY = "pickle_level";

function savedShown(): Key[] {
  try {
    const v = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? "null");
    if (Array.isArray(v) && v.length >= 1 && v.length <= SHOWN && v.every((k) => ALL.some((w) => w.key === k))) return v;
  } catch {}
  return DEFAULT;
}

// `petBusiness` makes Pickle that business's shared pet (a client's Overview).
export default function QueueWidgets({ week, reel, pet, tally, earnHint = "Deliver a job, do a habit or finish a to-do to earn an oatcake", petBusiness }: { week: WeekDay[] | null; reel: ReelItem[]; pet: PetView | null; tally: WeekStats; earnHint?: string; petBusiness?: string }) {
  const [shown, setShown] = useState<Key[]>(DEFAULT);
  const [menu, setMenu] = useState(false);
  const [dragging, setDragging] = useState<Key | null>(null);
  const [armed, setArmed] = useState<Key | null>(null);
  useEffect(() => setShown(savedShown()), []);
  // Without dates there's no week ahead to show, so This week takes its place.
  const offer = ALL.filter((w) => w.key !== "week" || week);
  const visible = [...new Set(shown.map((k): Key => (k === "week" && !week ? "tally" : k)))];

  // Close the menu on a click elsewhere or Escape.
  useEffect(() => {
    if (!menu) return;
    const away = (e: Event) => !(e.target as Element).closest?.(".widget-menu, .widget-more") && setMenu(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [menu]);

  const save = (next: Key[]) => {
    setShown(next);
    try { localStorage.setItem(SHOWN_KEY, JSON.stringify(next)); } catch {}
  };
  // Two show at a time: picking another swaps out the right-hand one; picking a showing one hides
  // it (as long as one stays).
  const pick = (k: Key) => {
    if (visible.includes(k)) return visible.length > 1 && save(visible.filter((x) => x !== k));
    save(visible.length < SHOWN ? [...visible, k] : [...visible.slice(0, SHOWN - 1), k]);
  };
  const drop = (target: Key) => (e: DragEvent) => {
    e.preventDefault();
    if (!dragging || dragging === target) return;
    const next = visible.filter((k) => k !== dragging);
    next.splice(next.indexOf(target) + (visible.indexOf(dragging) < visible.indexOf(target) ? 1 : 0), 0, dragging);
    save(next);
  };

  const body: Record<Key, React.ReactNode> = {
    pet: <Pet pet={pet} earnHint={earnHint} business={petBusiness} />,
    week: week ? <Week days={week} /> : null,
    reel: <Reel items={reel} />,
    tally: <Tally {...tally} />,
    days: <Days />,
  };

  return (
    <section className={`widgets n${visible.length}`} aria-label="At a glance">
      {visible.map((k) => (
        <div
          key={k}
          className={`widget w-${k}${dragging === k ? " dragging" : ""}`}
          draggable={armed === k}
          onDragStart={(e) => { setDragging(k); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", k); }}
          onDragEnd={() => { setDragging(null); setArmed(null); }}
          onDragOver={(e) => dragging && e.preventDefault()}
          onDrop={drop(k)}
        >
          <h4>
            {ALL.find((w) => w.key === k)!.title}
            <span
              className="widget-grip"
              aria-hidden="true"
              title="Drag to swap sides"
              onPointerDown={() => setArmed(k)}
              onPointerUp={() => !dragging && setArmed(null)}
            >
              <svg viewBox="0 0 10 16"><circle cx="2.5" cy="3" r="1.3" /><circle cx="7.5" cy="3" r="1.3" /><circle cx="2.5" cy="8" r="1.3" /><circle cx="7.5" cy="8" r="1.3" /><circle cx="2.5" cy="13" r="1.3" /><circle cx="7.5" cy="13" r="1.3" /></svg>
            </span>
          </h4>
          {body[k]}
        </div>
      ))}
      <div className="widget-side">
        <button type="button" className="widget-more" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Choose widgets" title="Choose widgets">
          <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="5" height="5" rx="1.2" /><rect x="9.5" y="1.5" width="5" height="5" rx="1.2" /><rect x="1.5" y="9.5" width="5" height="5" rx="1.2" /><path d="M12 9.5v5M9.5 12h5" /></svg>
        </button>
        {menu && (
          <div className="widget-menu" role="menu" aria-label="Widgets">
            <p>Widgets <small>Two show at a time</small></p>
            {offer.map((w) => {
              const on = visible.includes(w.key);
              return (
                <button key={w.key} type="button" role="menuitemcheckbox" aria-checked={on} className={on ? "on" : undefined} onClick={() => pick(w.key)}>
                  <span><b>{w.title}</b><small>{w.blurb}</small></span>
                  <i aria-hidden="true">{on ? "✓" : "+"}</i>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function Week({ days }: { days: WeekDay[] }) {
  const most = Math.max(4, ...days.map((d) => d.jobs.length));
  return (
    <div className="wk" style={{ ["--rows" as string]: Math.min(most, 7) }}>
      {days.map((d) => (
        <div key={d.date} className={d.today ? "wk-day today" : "wk-day"}>
          <div className="wk-stack">
            {d.jobs.slice(0, 7).map((j) => (
              <Link key={j.id} href={`/tickets/${j.id}`} className="wk-job" style={{ background: j.color }} title={j.title} aria-label={j.title} />
            ))}
            {d.jobs.length > 7 && <span className="wk-more">+{d.jobs.length - 7}</span>}
          </div>
          <span className="wk-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Reel({ items }: { items: ReelItem[] }) {
  if (!items.length) return <p className="widget-empty">Finished work with images shows up here.</p>;
  return (
    <div className="reel">
      {items.map((r) => (
        <Link key={r.id} href={`/tickets/${r.id}`} title={r.title}>
          <Thumb bucket="deliveries" path={r.path} full={r.url} alt={r.title} />
        </Link>
      ))}
    </div>
  );
}

function Tally({ delivered, due, late }: WeekStats) {
  if (due == null || late == null)
    return (
      <div className="tally">
        <p><b>{delivered}</b> <span>delivered this week</span></p>
      </div>
    );
  const total = delivered + due;
  return (
    <div className="tally">
      <p><b>{delivered}<small> / {total}</small></b> <span>delivered this week</span></p>
      <div className="meter"><i style={{ width: `${total ? (delivered / total) * 100 : 0}%`, background: "var(--green)" }} /></div>
      <span className={late > 0 ? "tally-late" : undefined}>{late > 0 ? `${late} running late` : "Nothing late"}</span>
    </div>
  );
}

// Days active: a column of squares for each day this month, lit green on days you used Oatcake and
// stacking higher the longer you were on it, with a ring that closes as the month fills up and the last few months'
// counts to beat. Read from your own usage stats (my_active_days); today counts as soon as you're here.
const MONTHS = 3;
const DAY_MS = 86_400_000;
function londonToday() {
  // en-CA gives YYYY-MM-DD.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
function iso(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}
// Squares lit in a day's column, by minutes active: any, 10, 30, 60, 120.
const STACK = 5;
function level(ms: number) {
  const min = ms / 60_000;
  return min >= 120 ? 5 : min >= 60 ? 4 : min >= 30 ? 3 : min >= 10 ? 2 : 1;
}
function Days() {
  const [days, setDays] = useState<Map<string, number> | null>(null);
  const [failed, setFailed] = useState(false);
  const today = londonToday();
  const [y, m, d] = today.split("-").map(Number);
  const mi = m - 1;
  useEffect(() => {
    createClient()
      .rpc("my_active_days", { p_from: iso(y, mi - MONTHS, 1) })
      .then(({ data, error }) => {
        if (error) return setFailed(true);
        setDays(new Map((data as { day: string; ms: number }[]).map((r) => [r.day, Number(r.ms)])));
      });
  }, [y, mi]);

  if (failed) return <p className="widget-empty">Days you use Oatcake will light up here.</p>;
  return <DaysView days={days} today={today} />;
}
export function DaysView({ days, today }: { days: Map<string, number> | null; today: string }) {
  const [y, m, d] = today.split("-").map(Number);
  const mi = m - 1;
  const used = (k: string) => days?.has(k) || k === today;
  const inMonth = new Date(Date.UTC(y, mi + 1, 0)).getUTCDate();
  const cells: { key: string; n: number; lvl: number; future: boolean }[] = [];
  for (let n = 1; n <= inMonth; n++) {
    const k = iso(y, mi, n);
    cells.push({ key: k, n, lvl: used(k) ? level(days?.get(k) ?? 0) : 0, future: n > d });
  }
  const count = cells.filter((c) => c.lvl).length;
  const ring = 2 * Math.PI * 22;
  const past = Array.from({ length: MONTHS }, (_, i) => {
    const at = new Date(Date.UTC(y, mi - 1 - i, 1));
    const len = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0)).getUTCDate();
    let n = 0;
    for (let t = at.getTime(); t < at.getTime() + len * DAY_MS; t += DAY_MS) if (days?.has(new Date(t).toISOString().slice(0, 10))) n++;
    return { label: at.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }), n, len };
  });
  const best = Math.max(...past.map((p) => p.n));
  return (
    <div className={`dx${days ? "" : " loading"}`}>
      <div className="dx-ring" title={`${count} of ${d} days so far this month`}>
        <svg viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="22" className="dx-track" />
          <circle cx="26" cy="26" r="22" className="dx-fill" strokeDasharray={`${(count / inMonth) * ring} ${ring}`} />
        </svg>
        <b>{count}</b>
      </div>
      <div className="dx-grid" role="img" aria-label={`${count} days active this month`}>
        <div className="dx-cols" style={{ ["--days" as string]: inMonth }}>
          {cells.map((c) => (
            <span key={c.key} className={`dx-day${c.future ? " future" : ""}${c.key === today ? " today" : ""}`} title={`${c.n} ${new Date(Date.UTC(y, mi, c.n)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}${c.lvl ? " · active" : ""}`}>
              {Array.from({ length: STACK }, (_, i) => STACK - 1 - i).map((i) => <i key={i} className={i < c.lvl ? `on s${i}` : undefined} />)}
            </span>
          ))}
        </div>
      </div>
      <div className="dx-stats">
        <p>{new Date(Date.UTC(y, mi, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}<span>Active: <em>{count}</em></span></p>
        {past.map((p) => (
          <p key={p.label} className={p.n && p.n === best ? "best" : undefined}>{p.label}<span>{p.n}<small>/{p.len}</small></span></p>
        ))}
      </div>
    </div>
  );
}

// Pickle, a little LCD pet like an old Tamagotchi (rules in lib/pet.ts). Delivered jobs (or sent
// requests) fill its tin with oatcakes; Feed gives it one, and five can be swapped for a golden one. Visiting each
// day keeps a streak going. It never dies, it just gets peckish.
function Pet({ pet: start, earnHint, business }: { pet: PetView | null; earnHint: string; business?: string }) {
  const tinKey = business ? `${TIN_KEY}_${business}` : TIN_KEY;
  const [pet, setPet] = useState(start);
  const [act, setAct] = useState<Act | null>(null);
  const [busy, setBusy] = useState(false);
  const [news, setNews] = useState<string | null>(null);
  const [out, setOut] = useState<Outing | null>(null);
  const stageEl = useRef<HTMLButtonElement>(null);
  const walkEl = useRef<HTMLSpanElement>(null);
  useEffect(() => setPet(start), [start]);

  // In his screen Pickle always heads toward your cursor (left and right), hopping as he goes.
  useEffect(() => {
    let cursor: number | null = null, x = -1, raf = 0;
    const move = (e: PointerEvent) => { cursor = e.clientX; };
    const tick = () => {
      const box = stageEl.current?.getBoundingClientRect(), w = walkEl.current;
      if (box && w) {
        const max = box.width - w.offsetWidth;
        if (x < 0) x = max / 2;
        const target = cursor === null ? x : Math.min(max, Math.max(0, cursor - box.left - w.offsetWidth / 2));
        const d = target - x;
        x += Math.sign(d) * Math.min(Math.abs(d), 2.5);
        w.style.left = `${Math.round(x / 2) * 2}px`;
        w.classList.toggle("moving", Math.abs(d) > 3);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    addEventListener("pointermove", move);
    return () => { cancelAnimationFrame(raf); removeEventListener("pointermove", move); };
  }, []);

  // Oatcakes earned since you last looked get a mention.
  useEffect(() => {
    if (!start) return;
    let seen = NaN;
    try { seen = Number(localStorage.getItem(tinKey) ?? "NaN"); } catch {}
    try { localStorage.setItem(tinKey, String(start.tin)); } catch {}
    if (!Number.isNaN(seen) && start.tin > seen) {
      setNews(`+${start.tin - seen} in the tin!`);
      // Fresh oatcakes from a finished job: Pickle hops out of the screen and explores the page.
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setOut("explore");
    }
    let seenLevel = NaN;
    try { seenLevel = Number(localStorage.getItem(LEVEL_KEY) ?? "NaN"); } catch {}
    try { localStorage.setItem(LEVEL_KEY, String(start.level)); } catch {}
    if (!Number.isNaN(seenLevel) && start.level > seenLevel) setNews(`Grew to LV ${start.level}!`);
  }, [start]);

  if (!pet) return <p className="widget-empty">Pickle is hatching…</p>;

  const play = (a: Act, ms: number) => {
    setAct(a);
    setTimeout(() => setAct(null), ms);
  };
  // An oatcake: a few chomps, then Pickle turns into a pickle for three seconds.
  const feed = async (kind: "oatcake" | "golden") => {
    if (busy) return;
    setBusy(true);
    setNews(null);
    if (kind === "golden") play("golden", 3200);
    else {
      setAct("eat");
      setTimeout(() => play("pickle", 3000), 1200);
    }
    const started = Date.now();
    try {
      const next = await feedPickle(kind, business);
      if (next) {
        try { localStorage.setItem(tinKey, String(next.tin)); localStorage.setItem(LEVEL_KEY, String(next.level)); } catch {}
        // Show the new stats (and any growth) once the snack is finished.
        const wait = Math.max(0, (kind === "golden" ? 3200 : 4200) - (Date.now() - started));
        const grew = next.level > pet.level;
        setTimeout(() => {
          setPet(next);
          if (grew) play("levelup", 2600);
        }, wait);
      }
    } finally {
      setBusy(false);
    }
  };

  const canDance = pet.hunger >= DANCE_AT;
  const mood: Mood = act === "eat" || act === "golden" ? "eat" : act === "happy" || act === "dance" || act === "levelup" || pet.glowing ? "happy" : pet.mood;
  const meters: [string, number][] = [["Food", pet.hunger], ["Joy", pet.happy], ["Grow", pet.growth]];
  const says =
    act === "golden" ? "Golden!!" : act === "eat" ? "Nom nom!" : act === "pickle" ? "I'm a pickle!" : act === "dance" ? "♪ ♫ ♪" : act === "levelup" ? `Level up! LV ${pet.level}` : act === "happy" ? "♥" :
    out ? "Exploring!" : news ?? (pet.mood === "sad" ? (pet.tin ? "Feed me?" : "Peckish...") : `Day ${pet.streak} streak`);
  return (
    <div className={`lcd ${pixel.className}${pet.glowing ? " glowing" : ""}`}>
      <button
        type="button"
        ref={stageEl}
        className={`lcd-stage ${act ?? mood}${out ? " away" : ""}`}
        onClick={() => !act && !out && play("happy", 1600)}
        onDoubleClick={() => (!act || act === "happy") && setOut("explore")}
        aria-label={`Pickle, level ${pet.level}. Click to give Pickle a fuss, double-click to let him out to explore`}
      >
        <span className="lcd-name">Pickle <small>LV {pet.level}</small></span>
        <span className="lcd-says">{says}</span>
        <span className="lcd-walk" ref={walkEl}>
          {act === "pickle" ? <Gherkin /> : <Blob mood={mood} stage={stageFor(pet.level)} />}
          {(act === "eat" || act === "golden") && <Snack golden={act === "golden"} />}
          {act === "golden" && <span className="lcd-sparkle" aria-hidden="true">✦ ✧ ✦</span>}
          {act === "pickle" && <span className="lcd-poof" aria-hidden="true">* *</span>}
        </span>
      </button>
      {out && <Roam key={out} mode={out} stage={stageFor(pet.level)} home={() => stageEl.current?.getBoundingClientRect() ?? null} onHome={() => { setOut(null); play("happy", 1600); }} />}
      <div className="lcd-meters">
        {meters.map(([label, v]) => (
          <span key={label} className="lcd-meter" title={`${label} ${Math.round(v * 100)}%`}>
            {label}
            <i>{[0, 1, 2, 3].map((n) => <b key={n} className={v > n / 4 + 0.05 ? "on" : undefined} />)}</i>
          </span>
        ))}
      </div>
      <div className="lcd-keys">
        <button type="button" onClick={() => feed("oatcake")} disabled={busy || !!act || !!out || !pet.tin} title={pet.tin ? "Give Pickle an oatcake" : earnHint}>
          Feed <b>×{pet.tin}</b>
        </button>
        <button type="button" onClick={() => feed("golden")} disabled={busy || !!act || !!out || pet.tin < GOLDEN_COST} title={`Swap ${GOLDEN_COST} oatcakes for a golden one`}>
          ★ Gold
        </button>
        <button type="button" onClick={() => play("dance", 3200)} disabled={!!act || !!out || !canDance} title={canDance ? "Make Pickle dance" : "Pickle needs feeding before he'll dance"}>
          Dance
        </button>
      </div>
    </div>
  );
}

// Pickle out of the screen: after a job is finished (or when you double-click him) he hops out and
// bounces between spots around the page by himself, then trots back home. Clicking him (or Escape)
// sends him home early. Inside his screen he follows your cursor instead (see Pet).
type Outing = "explore";
const ROAM_MS: Record<Outing, number> = { explore: 14_000 };
function Roam({ mode, stage, home, onHome }: { mode: Outing; stage: Stage; home: () => DOMRect | null; onHome: () => void }) {
  const el = useRef<HTMLButtonElement>(null);
  const back = useRef(false);
  const done = useRef(onHome);
  const where = useRef(home);
  done.current = onHome;
  where.current = home;
  useEffect(() => {
    const spot = (r: DOMRect) => [r.left + r.width / 2, r.bottom - 20];
    const home = () => where.current();
    const h = home();
    let [x, y] = h ? spot(h) : [innerWidth / 2, innerHeight / 2];
    let [tx, ty] = [x, y - 60];
    let raf = 0, rest = 0;
    // Somewhere new on screen, away from the edges.
    const pick = () => { tx = 60 + Math.random() * (innerWidth - 120); ty = 90 + Math.random() * (innerHeight - 150); };
    pick();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") back.current = true; };
    const timer = setTimeout(() => (back.current = true), ROAM_MS[mode]);
    const tick = () => {
      if (back.current) {
        const r = home();
        if (!r) return done.current();
        [tx, ty] = spot(r);
      }
      let dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy);
      if (back.current && d < 10) return done.current();
      // Exploring: arrive, look around for a beat, then hop off somewhere else.
      if (!back.current && d < 4) {
        if (!rest) rest = performance.now() + 600 + Math.random() * 1400;
        else if (performance.now() > rest) { rest = 0; pick(); }
        dx = dy = d = 0;
      }
      const step = Math.min(d, back.current ? 10 : 5 + d / 40);
      if (d > 1) { x += (dx / d) * step; y += (dy / d) * step; }
      const n = el.current;
      if (n) {
        // Whole pixels, like the LCD.
        n.style.transform = `translate(${Math.round(x / 2) * 2}px, ${Math.round(y / 2) * 2}px)`;
        n.classList.toggle("moving", d > 6);
        if (Math.abs(dx) > 3) n.classList.toggle("left", dx < 0);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      removeEventListener("keydown", key);
    };
  }, []);
  return createPortal(
    <button ref={el} type="button" className="pickle-out" onClick={() => (back.current = true)} aria-label="Pickle is exploring. Click to send him home">
      <span><Blob mood="happy" stage={stage} /></span>
    </button>,
    document.body,
  );
}

// How full Pickle has to be before he'll dance.
const DANCE_AT = 0.6;
type Act = "eat" | "golden" | "happy" | "dance" | "pickle" | "levelup";

type Mood = "idle" | "happy" | "sad" | "eat";

// The body is worked out once: an outlined round blob on a 22 × 18 grid, shaded along its
// lower right like the old LCD ones. Faces are drawn over it per mood.
const W = 22, H = 18, PX = 4;
const BODY = (() => {
  const cx = 10.5, cy = 9.2, rx = 10, ry = 8.4;
  const inside = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  let ink = "", shade = "";
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      const px = `M${x * PX} ${y * PX}h${PX}v${PX}h-${PX}z`;
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) ink += px;
      else if (!inside(x + 2, y + 1) || !inside(x + 1, y + 2)) shade += px;
    }
  return { ink, shade };
})();
const FACES: Record<Mood, string[]> = {
  idle: [".#.......#.", "#.#.....#.#", "#.#.....#.#", ".#..###..#."],
  happy: ["...........", ".#.......#.", "#.#.....#.#", "....###...."],
  sad: ["...........", "###.....###", "...........", "...#####..."],
  eat: ["...........", "##.......##", "....###....", "....###...."],
};
function face(rows: string[]) {
  let d = "";
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === "#") d += `M${(x + 5) * PX} ${(y + 7) * PX}h${PX}v${PX}h-${PX}z`; }));
  return d;
}
// Pickle grows up as he levels: a tiny baby, a bigger blob, then feet, then a crowned grown-up.
type Stage = "baby" | "kid" | "teen" | "adult";
function stageFor(level: number): Stage {
  return level >= 10 ? "adult" : level >= 6 ? "teen" : level >= 3 ? "kid" : "baby";
}
const CROWN = ["#..#..#", "##.#.##", "#######", "#######"];
const FEET = ["..###.......###...", ".####......####..."];
function sprite(rows: string[], dx: number, dy: number) {
  let d = "";
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === "#") d += `M${(x + dx) * PX} ${(y + dy) * PX}h${PX}v${PX}h-${PX}z`; }));
  return d;
}
function Blob({ mood, stage }: { mood: Mood; stage: Stage }) {
  const top = stage === "adult" ? 3 : 0;
  const feet = stage === "teen" || stage === "adult";
  const rows = H + top + (feet ? 2 : 0);
  return (
    <svg className={`lcd-blob ${stage}`} viewBox={`0 ${-top * PX} ${W * PX} ${rows * PX}`} aria-hidden="true" shapeRendering="crispEdges">
      <path className="lcd-shade" d={BODY.shade} />
      <path className="lcd-ink" d={BODY.ink + face(FACES[mood]) + (feet ? sprite(FEET, 2, H - 1) : "") + (top ? sprite(CROWN, 7, -top) : "")} />
    </svg>
  );
}
// Pickle as an actual pickle: a bumpy upright gherkin with the same 0_0 face. # is ink, + is shade.
const GHERKIN_ART = [
  "....####....",
  "...#....#...",
  "..#..#...+#.",
  "..#......+#.",
  ".#.......+#.",
  ".#.##..##.+#",
  ".#.##..##.+#",
  ".#........+#",
  ".#..####..+#",
  ".#........+#",
  ".#..#.....+#",
  ".#......#.+#",
  ".#........+#",
  ".#...#....+#",
  ".#........+#",
  "..#.....#+#.",
  "..#.#...++#.",
  "..#.....+#..",
  "...#..++#...",
  "....####....",
];
const GW = 12, GH = GHERKIN_ART.length;
const GHERKIN = (() => {
  let ink = "", shade = "";
  GHERKIN_ART.forEach((row, y) => [...row].forEach((c, x) => {
    const px = `M${x * PX} ${y * PX}h${PX}v${PX}h-${PX}z`;
    if (c === "#") ink += px;
    else if (c === "+") shade += px;
  }));
  return { ink, shade };
})();
function Gherkin() {
  return (
    <svg className="lcd-gherkin" viewBox={`0 0 ${GW * PX} ${GH * PX}`} aria-hidden="true" shapeRendering="crispEdges">
      <path className="lcd-shade" d={GHERKIN.shade} />
      <path className="lcd-ink" d={GHERKIN.ink} />
    </svg>
  );
}

const SNACK = [".###.", "#.#.#", "##.##", "#.#.#", ".###."];
function Snack({ golden = false }: { golden?: boolean }) {
  let d = "";
  SNACK.forEach((row, y) => [...row].forEach((c, x) => { if (c === "#") d += `M${x * PX} ${y * PX}h${PX}v${PX}h-${PX}z`; }));
  return (
    <svg className={golden ? "lcd-snack golden" : "lcd-snack"} viewBox={`0 0 ${5 * PX} ${5 * PX}`} aria-hidden="true" shapeRendering="crispEdges">
      <path className="lcd-ink" d={d} />
    </svg>
  );
}
