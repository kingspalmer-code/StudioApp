"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Capture from "@/components/Capture";
import { Pet } from "@/components/QueueWidgets";
import { flashSaved } from "@/components/Saved";
import { updatePlanItem } from "@/app/calendar/actions";
import { HabitIcon } from "@/app/habits/Habits";
import { logHabit } from "@/app/habits/actions";
import { amountLabel, indexLogs, mondayOf, paint, statsFor, weekday, type Habit, type HabitLog } from "@/lib/habits";
import type { PetView } from "@/lib/pet";
import { addDays, hhmm, isEvent, mapsLink, planSpan, type PlanItem } from "@/lib/plan";
import { formatDate } from "@/lib/priority";
import Focus from "./Focus";
import Reset from "./Reset";

// How many things Today asks of you. More can be on for today; Today only puts three up front.
const THREE = 3;
// How far ahead "Coming up" looks, and how many it shows before pointing to the calendar.
const AHEAD = 14;
const SOON = 5;
const RESET_KEY = "oatcake-reset-";

type NextJob = { id: number; title: string; due: string | null };

export default function Today({
  name,
  today,
  initial,
  doneLately,
  habits,
  logs: startLogs,
  pet,
  next,
  jobsLabel,
  fromBoss,
  readOnly,
  brain,
  startReset,
}: {
  name: string;
  today: string;
  initial: PlanItem[];
  doneLately: PlanItem[];
  habits: Habit[];
  logs: HabitLog[];
  pet: PetView | null;
  next: NextJob[];
  jobsLabel: string;
  fromBoss: { count: number; name: string } | null;
  readOnly: boolean;
  brain: boolean;
  startReset: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [done, setDone] = useState(doneLately);
  const [logs, setLogs] = useState(startLogs);
  const [focus, setFocus] = useState<PlanItem | null>(null);
  const [resetting, setResetting] = useState(startReset);
  const [resetDue, setResetDue] = useState(false);
  const [showPlate, setShowPlate] = useState(false);
  const [skip, setSkip] = useState(0);
  const [popping, setPopping] = useState<number | null>(null);

  // The reset is offered on Sundays and Mondays, until it's been done (or waved off) that week.
  const week = mondayOf(today);
  useEffect(() => {
    if (readOnly || ![6, 0].includes(weekday(today))) return;
    try {
      if (!localStorage.getItem(RESET_KEY + week)) setResetDue(true);
    } catch {}
  }, [today, week, readOnly]);
  const resetSeen = () => {
    setResetDue(false);
    try { localStorage.setItem(RESET_KEY + week, "1"); } catch {}
  };

  const tops = items.filter((i) => i.parent_id === null);
  const stepsOf = (id: number) => items.filter((i) => i.parent_id === id).sort((a, b) => a.rank - b.rank);
  const last = (i: PlanItem) => i.end_date ?? i.on_date!;
  const byTime = (a: PlanItem, b: PlanItem) => (a.at_time ?? "99").localeCompare(b.at_time ?? "99") || a.rank - b.rank;
  // Events (a shoot, a gig, anything with a time or a place) are on the calendar, not things to
  // tick: Today shows them under Coming up instead of in the three.
  const onToday = tops.filter((i) => i.on_date && i.on_date <= today && last(i) >= today && !isEvent(i)).sort(byTime);
  // Things from earlier days wait here quietly: no red, no count of days gone by. An event that
  // has been and gone just drops off.
  const plate = tops.filter((i) => i.on_date && last(i) < today && !isEvent(i)).sort((a, b) => b.on_date!.localeCompare(a.on_date!));
  // What's on the calendar from today for the next two weeks: today's events, then anything with
  // a day after today, soonest first.
  const horizon = addDays(today, AHEAD);
  const coming = tops
    .filter((i) => i.on_date && (isEvent(i) ? last(i) >= today : i.on_date > today) && i.on_date <= horizon)
    .sort((a, b) => (a.on_date! < today ? today : a.on_date!).localeCompare(b.on_date! < today ? today : b.on_date!) || byTime(a, b));
  const soon = coming.slice(0, SOON);
  const anyTime = tops.filter((i) => !i.on_date).sort((a, b) => a.rank - b.rank);
  const three = onToday.slice(0, THREE);
  const extra = onToday.length - three.length;
  // When today has room, Oatcake offers the top of the list to choose from, one swap at a time
  // (from earlier days only when the list has nothing undated, since those have their own Today).
  const room = THREE - three.length;
  const offerFrom = anyTime.length ? anyTime : plate;
  const offers = room > 0 && offerFrom.length ? Array.from({ length: Math.min(room, offerFrom.length) }, (_, n) => offerFrom[(skip + n) % offerFrom.length]) : [];
  const doneToday = done.filter((i) => i.done_at && i.done_at.slice(0, 10) === today);

  const byHabit = useMemo(() => indexLogs(logs), [logs]);
  const habitsToday = habits
    .map((h) => ({ h, s: statsFor(h, byHabit.get(h.id), today) }))
    .filter(({ s }) => s.dueToday);

  function move(id: number, on_date: string | null) {
    setItems((all) => all.map((i) => (i.id === id ? { ...i, on_date, end_date: null } : i)));
    if (!readOnly) updatePlanItem(id, { on_date, end_date: null }).then((r) => r.error && flashSaved("That didn't save"));
  }

  function tick(item: PlanItem) {
    setPopping(item.id);
    setTimeout(() => {
      setPopping(null);
      setItems((all) => all.filter((i) => i.id !== item.id && i.parent_id !== item.id));
      setDone((d) => [{ ...item, done_at: new Date().toISOString() }, ...d]);
    }, 450);
    if (!readOnly) updatePlanItem(item.id, { done: true });
    flashSaved("Done. An oatcake for Pickle.");
  }

  async function logIt(h: Habit, amount?: number) {
    const temp: HabitLog = { id: -Date.now(), habit_id: h.id, on_date: today, status: "done", amount: amount ?? null, feel: null, note: "" };
    setLogs((l) => [...l, temp]);
    if (readOnly) return;
    const r = await logHabit({ habit_id: h.id, on_date: today, status: "done", amount: amount ?? null });
    if (r.error || !r.row) {
      setLogs((l) => l.filter((x) => x.id !== temp.id));
      flashSaved("That didn't save");
    } else setLogs((l) => l.map((x) => (x.id === temp.id ? r.row! : x)));
  }

  const hour = new Date().getHours();
  const hello = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const dateLine = new Date(today + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const habitDaysThisWeek = logs.filter((l) => l.status === "done" && l.on_date >= addDays(today, -7)).length;

  return (
    <div className="today">
      <header className="td-head">
        <p className="td-date">{dateLine}</p>
        <h1 className="td-title">{name ? `${hello}, ${name}.` : `${hello}.`}</h1>
      </header>

      {!readOnly && <Capture brain={brain} onAdded={(added) => setItems((all) => [...all, ...added])} />}

      {resetDue && (
        <section className="td-reset" aria-label="Weekly reset">
          <div>
            <b>Five minutes for your week?</b>
            <span>Look back, let go of what doesn&apos;t matter, and choose a few things.</span>
          </div>
          <div className="td-reset-btns">
            <button type="button" className="link" onClick={resetSeen}>Not this week</button>
            <button type="button" className="btn small" onClick={() => setResetting(true)}>Start</button>
          </div>
        </section>
      )}

      <section className="td-section" aria-labelledby="td-three">
        <div className="td-section-head">
          <h2 id="td-three">Today&apos;s few things</h2>
          {doneToday.length > 0 && <span className="td-done-count">{doneToday.length} done today</span>}
        </div>
        {three.length === 0 && offers.length === 0 && (
          <p className="td-empty">{doneToday.length ? "All clear. Nice work. Rest counts too." : "Nothing planned. Jot something down above, or just have a gentle day."}</p>
        )}
        <ul className="td-list">
          {three.map((i) => {
            const steps = stepsOf(i.id);
            const left = steps.filter((s) => !s.done_at).length;
            return (
              <li key={i.id} className={`td-item${popping === i.id ? " pop" : ""}`}>
                <button type="button" className="td-tick" onClick={() => tick(i)} disabled={popping !== null} aria-label={`Done: ${i.title}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </button>
                <div className="td-item-body">
                  <Link href={`/calendar?item=${i.id}`} className="td-item-title">{i.title}</Link>
                  <span className="td-item-meta">
                    {[i.at_time ? hhmm(i.at_time) : "", steps.length ? `${steps.length - left}/${steps.length} steps` : "", i.end_date ? planSpan(i, today) : ""].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <div className="td-item-btns">
                  <button type="button" className="btn small" onClick={() => setFocus(i)}>Start</button>
                  <button type="button" className="link" onClick={() => move(i.id, addDays(today, 1))}>Not today</button>
                </div>
              </li>
            );
          })}
          {offers.map((i) => (
            <li key={`offer-${i.id}`} className="td-item offer">
              <span className="td-offer-dot" aria-hidden="true" />
              <div className="td-item-body">
                <span className="td-item-title">{i.title}</span>
                <span className="td-item-meta">From your list. Want it today?</span>
              </div>
              <div className="td-item-btns">
                <button type="button" className="btn small plain" onClick={() => move(i.id, today)}>Today</button>
                {offerFrom.length > offers.length && <button type="button" className="link" onClick={() => setSkip((s) => s + 1)}>Another</button>}
              </div>
            </li>
          ))}
        </ul>
        {extra > 0 && (
          <p className="td-more">
            {extra} more on for today. Three is plenty; the rest are on <Link href="/calendar">your To-do</Link>.
          </p>
        )}
        {fromBoss && (
          <Link href="/calendar" className="td-boss">
            {fromBoss.count} from {fromBoss.name} on your To-do ›
          </Link>
        )}
      </section>

      {soon.length > 0 && (
        <section className="td-section" aria-labelledby="td-soon">
          <div className="td-section-head">
            <h2 id="td-soon">Coming up</h2>
            <Link href="/calendar" className="td-link">Calendar ›</Link>
          </div>
          <ul className="td-cal">
            {soon.map((i) => {
              const day = i.on_date! < today ? today : i.on_date!;
              const d = new Date(day + "T12:00:00Z");
              return (
                <li key={i.id} className={day === today ? "now" : ""}>
                  <span className="td-cal-day" aria-hidden="true">
                    <b>{d.getUTCDate()}</b>
                    <span>{d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</span>
                  </span>
                  <div className="td-item-body">
                    <Link href={`/calendar?item=${i.id}`} className="td-item-title">{i.title}</Link>
                    <span className="td-item-meta">
                      {planSpan(i, today)}
                      {i.place && (
                        <>
                          {" · "}
                          <a href={mapsLink(i.place)} target="_blank" rel="noreferrer" className="td-cal-place">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>
                            {i.place}
                          </a>
                        </>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {coming.length > soon.length && (
            <p className="td-more">
              {coming.length - soon.length} more in the next two weeks, on <Link href="/calendar">your calendar</Link>.
            </p>
          )}
        </section>
      )}

      {plate.length > 0 && (
        <section className="td-section td-plate" aria-labelledby="td-plate">
          <button type="button" className="td-plate-head" onClick={() => setShowPlate((s) => !s)} aria-expanded={showPlate}>
            <h2 id="td-plate">Still on your plate</h2>
            <span>{plate.length} from earlier days, whenever you&apos;re ready</span>
          </button>
          {showPlate && (
            <ul className="td-list quiet">
              {plate.map((i) => (
                <li key={i.id} className="td-item">
                  <div className="td-item-body">
                    <Link href={`/calendar?item=${i.id}`} className="td-item-title">{i.title}</Link>
                    <span className="td-item-meta">Planned for {formatDate(i.on_date!)}</span>
                  </div>
                  <div className="td-item-btns">
                    <button type="button" className="btn small plain" onClick={() => move(i.id, today)}>Today</button>
                    <button type="button" className="link" onClick={() => move(i.id, null)}>Any time</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="td-grid">
        <section className="td-section" aria-labelledby="td-habits">
          <div className="td-section-head">
            <h2 id="td-habits">Habits today</h2>
            <Link href="/habits" className="td-link">All habits ›</Link>
          </div>
          {habits.length === 0 ? (
            <p className="td-empty">No habits yet. <Link href="/habits">Start a small one</Link>, like a glass of water.</p>
          ) : habitsToday.length === 0 ? (
            <p className="td-empty">Nothing asked of you today.</p>
          ) : (
            <ul className="td-habits">
              {habitsToday.map(({ h, s }) => (
                <li key={h.id} className={s.today.done ? "done" : ""} style={paint(h.colour)}>
                  <HabitIcon name={h.icon} size={18} />
                  <span className="td-habit-name">{h.name}</span>
                  {s.today.done ? (
                    <span className="td-habit-done">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                      Done
                    </span>
                  ) : h.kind === "count" ? (
                    <button type="button" className="td-habit-btn" onClick={() => logIt(h, 1)} aria-label={`Add one to ${h.name}`}>
                      {s.today.amount} / {amountLabel(h, h.per_day)} <b>+1</b>
                    </button>
                  ) : h.kind === "money" ? (
                    <Link href={`/habits?h=${h.id}`} className="td-habit-btn">Log it</Link>
                  ) : (
                    <button type="button" className="td-habit-btn" onClick={() => logIt(h)}>Did it</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="td-section td-pet" aria-label="Pickle">
          <div className="widget w-pet">
            <h4>Pickle</h4>
            <Pet pet={pet} earnHint="Do a habit or finish a to-do to earn an oatcake" />
          </div>
        </section>
      </div>

      {jobsLabel && next.length > 0 && (
        <section className="td-section" aria-labelledby="td-work">
          <div className="td-section-head">
            <h2 id="td-work">Next at work</h2>
            <Link href="/queue" className="td-link">{jobsLabel} ›</Link>
          </div>
          <ul className="td-list quiet">
            {next.map((j) => (
              <li key={j.id} className="td-item">
                <div className="td-item-body">
                  <Link href={`/tickets/${j.id}`} className="td-item-title">{j.title}</Link>
                  {j.due && <span className="td-item-meta">{j.due < today ? `Planned for ${formatDate(j.due)}` : `Due ${formatDate(j.due)}`}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!readOnly && !resetDue && (
        <p className="td-foot">
          <button type="button" className="link" onClick={() => setResetting(true)}>Do a weekly reset</button>
        </p>
      )}

      {focus && (
        <Focus
          item={focus}
          steps={stepsOf(focus.id)}
          readOnly={readOnly}
          onDone={() => { const i = focus; setFocus(null); tick(i); }}
          onClose={() => setFocus(null)}
        />
      )}
      {resetting && (
        <Reset
          done={done}
          habitDays={habitDaysThisWeek}
          open={[...plate, ...anyTime, ...tops.filter((i) => i.on_date && i.on_date > today)]}
          startDay={weekday(today) === 6 ? addDays(today, 1) : today}
          readOnly={readOnly}
          onClose={() => { setResetting(false); resetSeen(); }}
          onFinish={(gone, picked) => {
            const day = weekday(today) === 6 ? addDays(today, 1) : today;
            setItems((all) => all.filter((i) => !gone.includes(i.id) && !gone.includes(i.parent_id ?? -1)).map((i) => (picked.includes(i.id) ? { ...i, on_date: day, end_date: null } : i)));
            setResetting(false);
            resetSeen();
          }}
        />
      )}
    </div>
  );
}
