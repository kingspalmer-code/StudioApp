"use client";

import { useState } from "react";
import { CATALOGUE, EARN, EARN_BEFORE, GAME_CAP } from "@/lib/pickle/catalogue";

// The Lab, for platform admins: move the earn rates and a typical week, and see how many days each
// thing in the shop takes to buy. Aim for something small every few days and something big every
// few weeks. Sliders start at the live rates; changing them here changes nothing for anyone.
type Rates = { job: number; daily: number; habit: number; todo: number; games: number };
type Week = Rates;
const WEEKS: Record<string, Week> = {
  "Quiet week": { job: 1, daily: 3, habit: 4, todo: 5, games: 2 },
  "Steady week": { job: 4, daily: 5, habit: 10, todo: 12, games: 3 },
  "Busy week": { job: 9, daily: 7, habit: 14, todo: 25, games: 4 },
};
const RATE_ROWS: { k: keyof Rates; name: string; max: number }[] = [
  { k: "job", name: "Job delivered", max: 30 },
  { k: "daily", name: "First visit each day", max: 15 },
  { k: "habit", name: "Habit done for the day", max: 10 },
  { k: "todo", name: "To-do ticked off", max: 10 },
  { k: "games", name: "Games, most a day", max: 40 },
];
const WEEK_ROWS: { k: keyof Week; name: string; max: number }[] = [
  { k: "job", name: "Jobs delivered", max: 15 },
  { k: "daily", name: "Days you open Oatcake", max: 7 },
  { k: "habit", name: "Habit days done", max: 30 },
  { k: "todo", name: "To-dos ticked", max: 40 },
  { k: "games", name: "Days you play a game", max: 7 },
];
const LIVE: Rates = { job: EARN.job, daily: EARN.daily, habit: EARN.habit, todo: EARN.todo, games: GAME_CAP };
const BEFORE: Rates = { ...EARN_BEFORE, games: 0 };
// Most people won't max the games every day; count about two thirds of the cap.
const perWeek = (r: Rates, w: Week) => w.job * r.job + w.daily * r.daily + w.habit * r.habit + w.todo * r.todo + w.games * Math.round(r.games * 0.66);

export default function Lab() {
  const [rates, setRates] = useState(LIVE);
  const [weekName, setWeekName] = useState("Steady week");
  const [week, setWeek] = useState(WEEKS["Steady week"]);
  const now = perWeek(rates, week), before = perWeek(BEFORE, week);
  const things = CATALOGUE.filter((i) => i.price > 0).sort((a, b) => a.price - b.price);
  return (
    <section className="pw-place pw-lab">
      <div className="pw-panel">
        <h2>Earn rates</h2>
        {RATE_ROWS.map((r) => (
          <Slider key={r.k} id={`rate-${r.k}`} label={r.name} hint={`live ${LIVE[r.k]} · before ${BEFORE[r.k]}`} max={r.max} value={rates[r.k]} onChange={(v) => setRates({ ...rates, [r.k]: v })} />
        ))}
        <h2>A typical week</h2>
        <div className="pw-shelves">
          {Object.keys(WEEKS).map((n) => (
            <button key={n} type="button" aria-pressed={n === weekName} onClick={() => { setWeekName(n); setWeek(WEEKS[n]); }}>{n}</button>
          ))}
        </div>
        {WEEK_ROWS.map((r) => (
          <Slider key={r.k} id={`week-${r.k}`} label={r.name} max={r.max} value={week[r.k]} onChange={(v) => setWeek({ ...week, [r.k]: v })} />
        ))}
      </div>
      <div className="pw-panel">
        <div className="pw-totals">
          <span><small>A week, with these rates</small><b>{now}</b></span>
          <span><small>A week, before Pickle&apos;s World</small><b>{before}</b></span>
        </div>
        <h2>Days to buy each thing</h2>
        <div className="pw-bars">
          {things.map((i) => {
            const days = now ? (i.price / now) * 7 : Infinity;
            const label = !isFinite(days) ? "never" : days < 1 ? "same day" : days < 14 ? `${Math.ceil(days)} days` : `${Math.round(days / 7)} weeks`;
            return (
              <div key={i.id} className="pw-bar">
                <span>{i.name}</span>
                <span className="pw-track"><i className={days > 7 ? "slow" : undefined} style={{ width: `${Math.min(100, (Math.min(days, 42) / 42) * 100)}%` }} /></span>
                <span>{i.price} · {label}</span>
              </div>
            );
          })}
        </div>
        <p className="pw-blurb">Green is within a week; orange takes longer, which suits the big things. Change prices and rates in lib/pickle/catalogue.ts.</p>
      </div>
    </section>
  );
}

function Slider({ id, label, hint, max, value, onChange }: { id: string; label: string; hint?: string; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="pw-slider" htmlFor={id}>
      <span>{label}{hint && <small>{hint}</small>}</span>
      <output htmlFor={id}>{value}</output>
      <input id={id} type="range" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
