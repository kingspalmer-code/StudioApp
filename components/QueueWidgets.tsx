"use client";

import Link from "next/link";
import { Silkscreen } from "next/font/google";
import { useEffect, useState, type DragEvent } from "react";

const pixel = Silkscreen({ weight: "400", subsets: ["latin"] });

// The row of widgets above Up next: Pickle the pixel pet (fed an oatcake for every job delivered),
// the week ahead, the latest finished work and this week's tally. Drag a widget by its handle
// to reorder them; the order is kept on this computer.
export type WeekDay = { date: string; label: string; today: boolean; jobs: { id: number; title: string; color: string }[] };
export type ReelItem = { id: number; title: string; url: string };
export type PetStats = { fedTotal: number; fedWeek: number; overdue: number };
export type WeekStats = { delivered: number; due: number; late: number };

type Key = "pet" | "week" | "reel" | "tally";
const DEFAULT: Key[] = ["pet", "week", "reel", "tally"];
const ORDER_KEY = "widgets_order";
const FED_KEY = "pickle_fed";

function savedOrder(): Key[] {
  try {
    const v = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "null");
    if (Array.isArray(v) && v.length === DEFAULT.length && DEFAULT.every((k) => v.includes(k))) return v;
  } catch {}
  return DEFAULT;
}

export default function QueueWidgets({ week, reel, pet, tally }: { week: WeekDay[]; reel: ReelItem[]; pet: PetStats; tally: WeekStats }) {
  const [order, setOrder] = useState<Key[]>(DEFAULT);
  const [dragging, setDragging] = useState<Key | null>(null);
  const [armed, setArmed] = useState<Key | null>(null);
  useEffect(() => setOrder(savedOrder()), []);

  const drop = (target: Key) => (e: DragEvent) => {
    e.preventDefault();
    if (!dragging || dragging === target) return;
    const next = order.filter((k) => k !== dragging);
    next.splice(next.indexOf(target) + (order.indexOf(dragging) < order.indexOf(target) ? 1 : 0), 0, dragging);
    setOrder(next);
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch {}
  };

  const body: Record<Key, { title: string; node: React.ReactNode }> = {
    pet: { title: "Pickle", node: <Pet {...pet} /> },
    week: { title: "Week ahead", node: <Week days={week} /> },
    reel: { title: "Fresh out the oven", node: <Reel items={reel} /> },
    tally: { title: "This week", node: <Tally {...tally} /> },
  };

  return (
    <section className="widgets" aria-label="At a glance">
      {order.map((k) => (
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
            {body[k].title}
            <span
              className="widget-grip"
              aria-hidden="true"
              title="Drag to move"
              onPointerDown={() => setArmed(k)}
              onPointerUp={() => !dragging && setArmed(null)}
            >
              <svg viewBox="0 0 10 16"><circle cx="2.5" cy="3" r="1.3" /><circle cx="7.5" cy="3" r="1.3" /><circle cx="2.5" cy="8" r="1.3" /><circle cx="7.5" cy="8" r="1.3" /><circle cx="2.5" cy="13" r="1.3" /><circle cx="7.5" cy="13" r="1.3" /></svg>
            </span>
          </h4>
          {body[k].node}
        </div>
      ))}
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
          <img src={r.url} alt={r.title} loading="lazy" />
        </Link>
      ))}
    </div>
  );
}

function Tally({ delivered, due, late }: WeekStats) {
  const total = delivered + due;
  return (
    <div className="tally">
      <b>{delivered}<small> / {total}</small></b>
      <span>delivered this week</span>
      <div className="meter"><i style={{ width: `${total ? (delivered / total) * 100 : 0}%`, background: "var(--green)" }} /></div>
      {late > 0 && <span className="tally-late">{late} running late</span>}
    </div>
  );
}

// Pickle, a little LCD pet like an old Tamagotchi. Its bars: Hunger fills with this week's
// deliveries, Happy drops when jobs run late, Growth counts toward the next level (every five
// oatcakes eaten). When it's been fed since you last looked, it eats the new oatcake in front of you.
function Pet({ fedTotal, fedWeek, overdue }: PetStats) {
  const happy = Math.max(1, Math.min(5, 2 + fedWeek - Math.min(2, overdue)));
  const level = 1 + Math.floor(fedTotal / 5);
  const growth = fedTotal % 5;
  const [eating, setEating] = useState(false);
  const [petted, setPetted] = useState(0);

  useEffect(() => {
    let seen = NaN;
    try { seen = Number(localStorage.getItem(FED_KEY) ?? "NaN"); } catch {}
    try { localStorage.setItem(FED_KEY, String(fedTotal)); } catch {}
    if (Number.isNaN(seen) || fedTotal <= seen) return;
    setEating(true);
    const t = setTimeout(() => setEating(false), 2600);
    return () => clearTimeout(t);
  }, [fedTotal]);

  const mood: Mood = eating ? "eat" : petted ? "happy" : happy <= 2 ? "sad" : "idle";
  const bars: [string, number][] = [["Hunger", Math.min(1, fedWeek / 4)], ["Happy", happy / 5], ["Growth", growth / 5]];
  const says = eating ? "Nom nom!" : petted ? "♥" : happy <= 2 ? "Hungry..." : `LV ${level}`;
  return (
    <div className={`lcd ${pixel.className}`}>
      <div className="lcd-bars">
        {bars.map(([label, v]) => (
          <span key={label} className="lcd-bar">
            {label}
            <i><b style={{ width: `${Math.round(v * 100)}%` }} /></i>
          </span>
        ))}
      </div>
      <button
        type="button"
        className={`lcd-stage ${mood}`}
        key={petted}
        onClick={() => { setPetted((n) => n + 1); setTimeout(() => setPetted(0), 1600); }}
        aria-label={`Pickle, level ${level}. Click to give Pickle a fuss`}
      >
        <Blob mood={mood} />
        {eating && <Snack />}
      </button>
      <div className="lcd-name">
        <span>Pickle</span>
        <span>{says}</span>
      </div>
    </div>
  );
}

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
function Blob({ mood }: { mood: Mood }) {
  return (
    <svg className="lcd-blob" viewBox={`0 0 ${W * PX} ${H * PX}`} aria-hidden="true" shapeRendering="crispEdges">
      <path className="lcd-shade" d={BODY.shade} />
      <path className="lcd-ink" d={BODY.ink + face(FACES[mood])} />
    </svg>
  );
}
const SNACK = [".###.", "#.#.#", "##.##", "#.#.#", ".###."];
function Snack() {
  let d = "";
  SNACK.forEach((row, y) => [...row].forEach((c, x) => { if (c === "#") d += `M${x * PX} ${y * PX}h${PX}v${PX}h-${PX}z`; }));
  return (
    <svg className="lcd-snack" viewBox={`0 0 ${5 * PX} ${5 * PX}`} aria-hidden="true" shapeRendering="crispEdges">
      <path className="lcd-ink" d={d} />
    </svg>
  );
}
