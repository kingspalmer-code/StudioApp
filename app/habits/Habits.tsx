"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import OatcakeBiscuit from "@/components/OatcakeBiscuit";
import NumberInput from "@/components/NumberInput";
import ConfirmButton from "@/components/ConfirmButton";
import { flashSaved } from "@/components/Saved";
import { addDays, monthDays, monthName, shiftMonth } from "@/lib/plan";
import {
  HABIT_COLOURS, HABIT_ICONS, PARTS, STARTERS, WEEKDAYS,
  amountLabel, dayOf, paint, easeNudge, indexLogs, isScheduled, mondayOf, paceLabel, perDayLabel, periodStart, statsFor,
  type Goal, type Habit, type HabitLog, type HabitStats, type Nudge, type Starter,
} from "@/lib/habits";
import { addHabit, answerEase, clearDay, logHabit, removeHabit, updateHabit, type HabitInput } from "./actions";
import { readHabits, type HabitIdea } from "./tell";

type View = "today" | "week" | "month" | "year";

export function HabitIcon({ name, size = 20, stroke = 1.7 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={HABIT_ICONS[name] ?? HABIT_ICONS.spark} />
    </svg>
  );
}

const CHECK = "M5 12.5 10 17l9-10";
const Check = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={CHECK} /></svg>
);

// A small physical click when the slider lands: a buzz on Android, and on iPhone (Safari 18+) the
// tick a switch makes when it's flipped, by flipping a hidden one.
function useTick() {
  const ref = useRef<HTMLLabelElement>(null);
  const tick = () => {
    navigator.vibrate?.(14);
    ref.current?.click();
  };
  const el = (
    <label ref={ref} className="hb-haptic" aria-hidden="true">
      {/* @ts-expect-error: "switch" is Safari's own attribute */}
      <input type="checkbox" switch="" tabIndex={-1} />
    </label>
  );
  return [tick, el] as const;
}

export default function Habits({ initial, initialLogs, today, readOnly, openId, brain }: { initial: Habit[]; initialLogs: HabitLog[]; today: string; readOnly: boolean; openId?: number; brain: boolean }) {
  const router = useRouter();
  const [habits, setHabits] = useState(initial);
  const [logs, setLogs] = useState(initialLogs);
  const [view, setView] = useState<View>("today");
  const [logging, setLogging] = useState<{ id: number; date: string } | null>(openId && initial.some((h) => h.id === openId) ? { id: openId, date: today } : null);
  const [editing, setEditing] = useState<Habit | "new" | null>(null);
  const [focus, setFocus] = useState<number | null>(initial[0]?.id ?? null);
  const [telling, setTelling] = useState(false);

  const byHabit = useMemo(() => indexLogs(logs), [logs]);
  const stats = useMemo(() => new Map(habits.map((h) => [h.id, statsFor(h, byHabit.get(h.id), today)])), [habits, byHabit, today]);
  const due = habits.filter((h) => stats.get(h.id)!.dueToday);
  const rest = habits.filter((h) => !stats.get(h.id)!.dueToday);
  const doneCount = due.filter((h) => stats.get(h.id)!.today.done).length;
  const nudges = habits.map((h) => ({ h, n: easeNudge(h, stats.get(h.id)!, today) })).filter((x): x is { h: Habit; n: Nudge } => Boolean(x.n));

  const replace = (row: Habit) => setHabits((all) => (all.some((h) => h.id === row.id) ? all.map((h) => (h.id === row.id ? row : h)) : [...all, row]));

  async function saveHabit(input: HabitInput, id?: number) {
    const res = id ? await updateHabit(id, input) : await addHabit({ ...input, rank: habits.length ? Math.max(...habits.map((h) => h.rank)) + 1 : 0 });
    if (res.error || !res.row) return res.error ?? "Couldn't save that.";
    replace(res.row);
    if (!id) setFocus(res.row.id);
    flashSaved(id ? "Saved" : `Added ${res.row.name}`);
    setEditing(null);
    return null;
  }

  async function addStarter(s: Starter) {
    await saveHabit(s);
  }

  async function remove(h: Habit) {
    setHabits((all) => all.filter((x) => x.id !== h.id));
    setEditing(null);
    setLogging(null);
    const res = await removeHabit(h.id);
    if (res.error) {
      replace(h);
      flashSaved("Couldn't remove it");
    }
  }

  async function log(h: Habit, date: string, status: "done" | "skip", extra: Partial<HabitLog> = {}) {
    const temp: HabitLog = { id: -Date.now(), habit_id: h.id, on_date: date, status, amount: extra.amount ?? null, feel: extra.feel ?? null, note: extra.note ?? "" };
    setLogs((all) => [...all, temp]);
    const res = await logHabit({ habit_id: h.id, on_date: date, status, amount: extra.amount, feel: extra.feel, note: extra.note });
    if (res.error || !res.row) {
      setLogs((all) => all.filter((l) => l.id !== temp.id));
      flashSaved(res.error ?? "Couldn't log that");
      return false;
    }
    setLogs((all) => all.map((l) => (l.id === temp.id ? res.row! : l)));
    return true;
  }

  async function undo(h: Habit, date: string) {
    const was = logs;
    setLogs((all) => all.filter((l) => !(l.habit_id === h.id && l.on_date === date)));
    const res = await clearDay(h.id, date);
    if (res.error) {
      setLogs(was);
      flashSaved("Couldn't undo that");
    }
  }

  async function ease(h: Habit, n: Nudge, take: boolean) {
    const res = await answerEase(h.id, take ? n.goal : null, n.kind);
    if (res.row) replace(res.row);
    if (take) flashSaved(n.kind === "ease" ? `Eased off: ${paceLabel(n.goal).toLowerCase()}` : "Back to your old goal");
  }

  // Coming back to the page later in the day picks up anything logged elsewhere.
  useEffect(() => {
    const back = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [router]);
  useEffect(() => setLogs(initialLogs), [initialLogs]);
  useEffect(() => setHabits(initial), [initial]);

  const logHabitRow = logging ? habits.find((h) => h.id === logging.id) : undefined;
  const focusHabit = habits.find((h) => h.id === focus) ?? habits[0];

  // Today's list, shown on its own on phones and as the tall tile of the desktop bento.
  const todayList = (
    <section className="hb-today" aria-label="Today">
      {due.length > 0 && (
        <div className="hb-progress">
          <span>{doneCount === due.length ? "All done today" : `${doneCount} of ${due.length} done`}</span>
          <div className="hb-bar"><i style={{ width: `${(doneCount / due.length) * 100}%` }} /></div>
        </div>
      )}
      {/* One at a time, so it never piles on. */}
      {!readOnly && nudges.slice(0, 1).map(({ h, n }) => <EaseCard key={h.id} h={h} n={n} onAnswer={(take) => ease(h, n, take)} />)}
      {PARTS.map((p) => {
        const list = due.filter((h) => h.part === p.key);
        if (!list.length) return null;
        const done = list.filter((h) => stats.get(h.id)!.today.done).length;
        return (
          <div key={p.key} className="hb-group">
            <h2 className="hb-group-title"><span><HabitIcon name={p.icon} size={14} />{p.label}</span><span>{done}/{list.length}</span></h2>
            {list.map((h) => (
              <HabitCard key={h.id} h={h} s={stats.get(h.id)!} days={byHabit.get(h.id)} today={today} onOpen={() => setLogging({ id: h.id, date: today })} />
            ))}
          </div>
        );
      })}
      {rest.length > 0 && (
        <div className="hb-group hb-rest">
          <h2 className="hb-group-title"><span>Done for now</span><span>{rest.length}</span></h2>
          {rest.map((h) => (
            <HabitCard key={h.id} h={h} s={stats.get(h.id)!} days={byHabit.get(h.id)} today={today} onOpen={() => setLogging({ id: h.id, date: today })} />
          ))}
        </div>
      )}
    </section>
  );

  const dateLabel = new Date(today + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className={`hb hb-on-${view}`}>
      <header className="hb-head">
        <div>
          <p className="hb-date">{dateLabel}</p>
          <h1 className="hb-title">Habits</h1>
        </div>
        {!readOnly && (
          <div className="hb-head-btns">
          {brain && (
            <button type="button" className="hb-tell-btn" aria-expanded={telling} onClick={() => setTelling(!telling)}>
              <OatcakeBiscuit small className="hb-tell-mark" />Tell Oatcake
            </button>
          )}
          <button type="button" className="hb-add" aria-label="New habit" onClick={() => setEditing("new")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          </div>
        )}
      </header>

      {brain && !readOnly && (telling || habits.length === 0) && (
        <TellOatcake
          have={habits.map((h) => h.name)}
          onClose={habits.length ? () => setTelling(false) : undefined}
          onAdd={async (ideas) => {
            let rank = habits.length ? Math.max(...habits.map((h) => h.rank)) + 1 : 0;
            const added: Habit[] = [];
            for (const idea of ideas) {
              const res = await addHabit({ ...idea, rank: rank++ });
              if (res.row) added.push(res.row);
            }
            setHabits((all) => [...all, ...added]);
            if (added[0]) setFocus((f) => f ?? added[0].id);
            flashSaved(added.length === ideas.length ? `Added ${added.length} habit${added.length === 1 ? "" : "s"}` : `Added ${added.length} of ${ideas.length}`);
            setTelling(false);
          }}
        />
      )}

      <div className="hb-seg" role="tablist">
        {(["today", "week", "month", "year"] as View[]).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={v === "today" ? "hb-seg-today" : ""} onClick={() => setView(v)}>
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {habits.length === 0 ? (
        <Empty readOnly={readOnly} onStarter={addStarter} onOwn={() => setEditing("new")} />
      ) : (
        <div className="hb-body">
          {todayList}

          <section className="hb-zoom" aria-label="Progress">
            <div className="hb-seg hb-seg-desk" role="tablist">
              {(["week", "month", "year"] as View[]).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v || (view === "today" && v === "week")} onClick={() => setView(v)}>
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            {view === "month" || view === "year" ? (
              <>
                <div className="hb-chips" role="tablist" aria-label="Habit">
                  {habits.map((h) => (
                    <button key={h.id} type="button" role="tab" aria-selected={focusHabit?.id === h.id} style={paint(h.colour)} onClick={() => setFocus(h.id)}>
                      <HabitIcon name={h.icon} size={15} />{h.name}
                    </button>
                  ))}
                </div>
                {focusHabit && (view === "month"
                  ? <MonthView h={focusHabit} s={stats.get(focusHabit.id)!} days={byHabit.get(focusHabit.id)} today={today} onDay={readOnly ? undefined : (d) => setLogging({ id: focusHabit.id, date: d })} />
                  : <YearView h={focusHabit} s={stats.get(focusHabit.id)!} days={byHabit.get(focusHabit.id)} today={today} />)}
              </>
            ) : (
              <WeekView habits={habits} stats={stats} byHabit={byHabit} today={today} onPick={(id) => { setFocus(id); setView("month"); }} />
            )}
          </section>
        </div>
      )}
      {habits.length > 0 && (
        <Bento
          habits={habits}
          stats={stats}
          byHabit={byHabit}
          today={today}
          due={due.length}
          doneCount={doneCount}
          focus={focusHabit}
          onFocus={setFocus}
          todayList={todayList}
          onDay={readOnly || !focusHabit ? undefined : (d) => setLogging({ id: focusHabit.id, date: d })}
        />
      )}

      {logHabitRow && logging && (
        <LogSheet
          key={`${logHabitRow.id}-${logging.date}`}
          h={logHabitRow}
          s={stats.get(logHabitRow.id)!}
          date={logging.date}
          today={today}
          day={dayOf(logHabitRow, byHabit.get(logHabitRow.id)?.get(logging.date) ?? [])}
          readOnly={readOnly}
          onClose={() => setLogging(null)}
          onLog={(status, extra) => log(logHabitRow, logging.date, status, extra)}
          onUndo={() => undo(logHabitRow, logging.date)}
          onEdit={() => { setEditing(logHabitRow); setLogging(null); }}
        />
      )}
      {editing && (
        <Editor
          h={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(input) => saveHabit(input, editing === "new" ? undefined : editing.id)}
          onRemove={editing === "new" ? undefined : () => remove(editing)}
        />
      )}
    </div>
  );
}

function TellOatcake({ have, onAdd, onClose }: { have: string[]; onAdd: (ideas: HabitIdea[]) => Promise<void>; onClose?: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ habits: HabitIdea[]; summary: string } | null>(null);
  const [off, setOff] = useState<Set<number>>(new Set());
  async function read(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await readHabits(text, have);
    setBusy(false);
    if (res.error || !res.habits) return setError(res.error ?? "Couldn't read that.");
    setFound({ habits: res.habits, summary: res.summary ?? "" });
    setOff(new Set());
  }
  const picked = found ? found.habits.filter((_, i) => !off.has(i)) : [];
  return (
    <section className="hb-tell" aria-label="Tell Oatcake your habits">
      {!found ? (
        <form onSubmit={read}>
          <h2><OatcakeBiscuit eating={busy} small className="hb-tell-mark" />Tell Oatcake your habits</h2>
          <textarea
            value={text}
            rows={3}
            maxLength={3000}
            placeholder="I want to get back into running, do yoga once a week, drink more water, and stop spending more than £20 a day on weekdays…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) read(e); }}
          />
          {error && <p className="error">{error}</p>}
          <div className="hb-tell-btns">
            {onClose && <button type="button" className="btn plain" onClick={onClose}>Cancel</button>}
            <button type="submit" className="btn" disabled={busy || !text.trim()}>{busy ? "Reading…" : "Set them up"}</button>
          </div>
        </form>
      ) : (
        <div>
          <h2><OatcakeBiscuit small className="hb-tell-mark" />{found.summary || "Here's what Oatcake set up"}</h2>
          <div className="hb-ideas">
            {found.habits.map((h, i) => (
              <button key={i} type="button" className="hb-idea" aria-pressed={!off.has(i)} style={paint(h.colour)} onClick={() => setOff((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                <span className="hb-ic"><HabitIcon name={h.icon} /></span>
                <span className="hb-card-main">
                  <b>{h.name}</b>
                  <small>{[paceLabel(h), h.kind === "count" ? (h.labels.length ? h.labels.join(" · ") : `${amountLabel(h, h.per_day)} a day`) : h.kind === "money" ? `Under £${h.per_day}` : h.unit ? `in ${h.unit}` : "", PARTS.find((p) => p.key === h.part)?.label, h.remind_at ? `nudge ${h.remind_at}` : ""].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="hb-state done">{!off.has(i) && <Check />}</span>
              </button>
            ))}
          </div>
          <p className="hb-hint left">Tap one to leave it out. You can change any of them after.</p>
          <div className="hb-tell-btns">
            <button type="button" className="btn plain" onClick={() => setFound(null)}>Say it again</button>
            <button type="button" className="btn" disabled={busy || !picked.length} onClick={async () => { setBusy(true); await onAdd(picked); setBusy(false); }}>
              {busy ? "Adding…" : `Add ${picked.length} habit${picked.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Empty({ readOnly, onStarter, onOwn }: { readOnly: boolean; onStarter: (s: Starter) => void; onOwn: () => void }) {
  const [adding, setAdding] = useState<string | null>(null);
  return (
    <div className="hb-empty">
      <OatcakeBiscuit className="hb-empty-mark" />
      <h2>Start small</h2>
      <p>Pick one or two to begin with. You can set how often each one happens, and ease off any time.</p>
      {!readOnly && (
        <>
          <div className="hb-starters">
            {STARTERS.map((s) => (
              <button key={s.name} type="button" disabled={adding === s.name} style={paint(s.colour)} onClick={async () => { setAdding(s.name); await onStarter(s); setAdding(null); }}>
                <span className="hb-ic"><HabitIcon name={s.icon} /></span>
                <span><b>{s.name}</b><small>{paceLabel(s)}</small></span>
              </button>
            ))}
          </div>
          <button type="button" className="btn" onClick={onOwn}>Make your own</button>
        </>
      )}
    </div>
  );
}

// The last seven days as little squares: filled when done, hatched when skipped or missed.
function WeekDots({ h, days, today }: { h: Habit; days?: Map<string, HabitLog[]>; today: string }) {
  const monday = mondayOf(today);
  return (
    <span className="hb-dots" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(monday, i);
        const day = dayOf(h, days?.get(d) ?? []);
        const part = h.kind === "count" && !day.done && day.amount > 0;
        const cls = day.done ? "on" : part ? "part" : day.skipped ? "skip" : d < today && isScheduled(h, d) ? "miss" : d === today ? "now" : "";
        return <i key={d} className={cls} />;
      })}
    </span>
  );
}

function HabitCard({ h, s, days, today, onOpen }: { h: Habit; s: HabitStats; days?: Map<string, HabitLog[]>; today: string; onOpen: () => void }) {
  const t = s.today;
  const sub = [
    paceLabel(h),
    h.kind !== "session" ? perDayLabel(h) : "",
    h.freq === "times" ? `${s.periodDone} of ${s.periodGoal}` : "",
    s.streak > 1 ? `${s.streak} ${s.unit === "wk" ? "wk" : "day"} streak` : "",
  ].filter(Boolean).join(" · ");
  let end: ReactNode;
  if (t.done) end = <span className="hb-state done"><Check /></span>;
  else if (t.skipped) end = <span className="hb-state skip">Skipped</span>;
  else if (h.kind === "count") {
    const share = Math.min(1, t.amount / h.per_day);
    end = <span className="hb-state count" style={{ background: `conic-gradient(var(--c) ${share * 360}deg, transparent 0)` }}><span>{h.per_day - t.amount}</span></span>;
  } else if (h.kind === "money") end = <span className="hb-state pill">£{h.per_day}</span>;
  else end = <span className="hb-state" />;
  return (
    <button type="button" className={`hb-card${t.done ? " is-done" : ""}`} style={paint(h.colour)} onClick={onOpen}>
      <span className="hb-ic"><HabitIcon name={h.icon} /></span>
      <span className="hb-card-main">
        <b>{h.name}</b>
        <small>{sub}</small>
        <WeekDots h={h} days={days} today={today} />
      </span>
      {end}
    </button>
  );
}

function EaseCard({ h, n, onAnswer }: { h: Habit; n: Nudge; onAnswer: (take: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const answer = async (take: boolean) => { setBusy(true); await onAnswer(take); };
  const goal = n.kind === "ease" && h.kind === "count" && n.goal.per_day !== h.per_day ? `${h.unit ? amountLabel(h, n.goal.per_day) : `${n.goal.per_day}×`} a day` : paceLabel(n.goal);
  return (
    <div className="hb-ease" style={paint(h.colour)}>
      <p className="hb-eyebrow">{n.kind === "ease" ? "A kinder goal?" : "Step back up?"}</p>
      <h3><HabitIcon name={h.icon} size={18} />{n.kind === "ease" ? `${h.name} missed ${n.misses} times lately` : `${h.name} is going well`}</h3>
      <p>{n.kind === "ease"
        ? `That's fine, your streak's safe. Want to make it easier for a bit? You can always step back up.`
        : `Three in a row since you eased off. Want to go back to ${paceLabel(n.goal).toLowerCase()}?`}</p>
      <p className="hb-ease-goal">{goal}</p>
      <div className="hb-ease-btns">
        <button type="button" className="btn plain" disabled={busy} onClick={() => answer(false)}>Keep it</button>
        <button type="button" className="btn" disabled={busy} onClick={() => answer(true)}>{n.kind === "ease" ? "Ease off" : "Step up"}</button>
      </div>
    </div>
  );
}

// Slide right to log, left to skip. The knob sits in the middle and springs back if let go early.
function Slider({ h, onDone, onSkip, doneText = "slide to log", disabled }: { h: Habit; onDone: () => void; onSkip?: () => void; doneText?: string; disabled?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState<{ start: number; half: number } | null>(null);
  const [landed, setLanded] = useState<"done" | "skip" | null>(null);
  const [tick, haptic] = useTick();
  const knob = 64;
  function down(e: React.PointerEvent) {
    if (disabled || landed) return;
    const r = track.current!.getBoundingClientRect();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ start: e.clientX, half: (r.width - knob) / 2 - 4 });
  }
  function move(e: React.PointerEvent) {
    if (!drag) return;
    const dx = Math.max(onSkip ? -drag.half : 0, Math.min(drag.half, e.clientX - drag.start));
    setX(dx);
  }
  function up() {
    if (!drag) return;
    const share = x / drag.half;
    setDrag(null);
    if (share > 0.82) { setX(drag.half); setLanded("done"); tick(); setTimeout(onDone, 160); }
    else if (share < -0.82 && onSkip) { setX(-drag.half); setLanded("skip"); tick(); setTimeout(onSkip, 160); }
    else setX(0);
  }
  function key(e: React.KeyboardEvent) {
    if (disabled || landed) return;
    if (e.key === "ArrowRight") { setLanded("done"); tick(); onDone(); }
    if (e.key === "ArrowLeft" && onSkip) { setLanded("skip"); tick(); onSkip(); }
  }
  const half = track.current ? (track.current.getBoundingClientRect().width - knob) / 2 - 4 : 1;
  const share = x / (half || 1);
  return (
    <div ref={track} className={`hb-slide${disabled ? " off" : ""}`} style={paint(h.colour)}>
      {haptic}
      {onSkip && <span className="hb-slide-l" style={{ opacity: 1 - Math.max(0, share) * 1.4 }}>‹ skip today</span>}
      <span className="hb-slide-r" style={{ opacity: 1 + Math.min(0, share) * 1.4 }}>{doneText} ›</span>
      <span className="hb-slide-fill" style={{ left: share >= 0 ? "50%" : `calc(50% + ${x}px - 32px)`, width: `${Math.abs(x) + 32}px`, marginLeft: share >= 0 ? -32 : 0, background: share < 0 ? "var(--label-3)" : undefined }} />
      <span
        className={`hb-knob${drag ? " dragging" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label={onSkip ? "Slide right to log it, left to skip today" : "Slide right to log it"}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={Math.round(share * 100) / 100}
        style={{ transform: `translateX(${x}px)` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
      >
        {landed === "done" ? <Check size={22} /> : <HabitIcon name={h.icon} size={24} stroke={2} />}
      </span>
    </div>
  );
}

// Drag round the ring to set how far or how long.
function Dial({ h, value, onValue, usual }: { h: Habit; value: number; onValue: (n: number) => void; usual: number | null }) {
  const minutes = /min/i.test(h.unit);
  const max = Math.max(minutes ? 60 : 10, Math.ceil(((usual ?? 0) * 2) / (minutes ? 15 : 5)) * (minutes ? 15 : 5));
  const step = minutes ? 1 : h.unit ? 0.1 : 1;
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const set = (n: number) => onValue(Math.round(Math.min(max, Math.max(0, n)) / step) * step);
  function at(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    const a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
    const share = (a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2);
    set(share * max);
  }
  const share = value / max;
  const R = 84, C = 2 * Math.PI * R;
  const kx = 100 + R * Math.sin(share * Math.PI * 2), ky = 100 - R * Math.cos(share * Math.PI * 2);
  return (
    <div className="hb-dial-wrap">
      <button type="button" className="hb-step" aria-label="Less" onClick={() => set(value - (minutes ? 5 : step * 5))}>−</button>
      <svg
        ref={ref}
        className="hb-dial"
        viewBox="0 0 200 200"
        onPointerDown={(e) => { dragging.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); at(e); }}
        onPointerMove={(e) => dragging.current && at(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        role="slider"
        aria-label={h.unit ? `How many ${h.unit}` : "How much"}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowRight") set(value + step);
          if (e.key === "ArrowDown" || e.key === "ArrowLeft") set(value - step);
        }}
      >
        <circle cx="100" cy="100" r={R} className="hb-dial-track" />
        <circle cx="100" cy="100" r={R} className="hb-dial-fill" strokeDasharray={`${share * C} ${C}`} transform="rotate(-90 100 100)" />
        <circle cx={kx} cy={ky} r="12" className="hb-dial-knob" />
        <text x="100" y="104" className="hb-dial-num">{Number.isInteger(value) ? value : value.toFixed(1)}</text>
        <text x="100" y="130" className="hb-dial-unit">{h.unit || "drag the ring"}</text>
      </svg>
      <button type="button" className="hb-step" aria-label="More" onClick={() => set(value + (minutes ? 5 : step * 5))}>+</button>
    </div>
  );
}

const FEELS: { key: NonNullable<HabitLog["feel"]>; label: string }[] = [
  { key: "tough", label: "Tough" },
  { key: "good", label: "Good" },
  { key: "flying", label: "Flying" },
];

function Sheet({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="hb-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="hb-sheet" role="dialog" aria-modal="true" aria-label={label}>
        <span className="hb-grab" />
        <button type="button" className="hb-x" aria-label="Close" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        {children}
      </div>
    </div>
  );
}

function LogSheet({ h, s, date, today, day, readOnly, onClose, onLog, onUndo, onEdit }: {
  h: Habit; s: HabitStats; date: string; today: string; day: ReturnType<typeof dayOf>; readOnly: boolean;
  onClose: () => void; onLog: (status: "done" | "skip", extra?: Partial<HabitLog>) => Promise<boolean>; onUndo: () => void; onEdit: () => void;
}) {
  const [amount, setAmount] = useState<number>(h.kind === "session" ? (s.usual ?? (/min/i.test(h.unit) ? 20 : 3)) : 0);
  const [taps, setTaps] = useState(0);
  const [feel, setFeel] = useState<HabitLog["feel"]>(null);
  const [note, setNote] = useState("");
  const [after, setAfter] = useState<"done" | "skip" | "more" | null>(null);
  const isToday = date === today;
  const when = isToday ? "today" : new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  const already = Math.min(h.per_day, Math.round(day.amount));
  const finished = day.done || day.skipped;

  async function done() {
    let extra: Partial<HabitLog> = {};
    if (h.kind === "session") extra = { amount: amount || null, feel, note };
    if (h.kind === "count") extra = { amount: taps || Math.max(1, h.per_day - already), note };
    if (h.kind === "money") extra = { amount, note };
    setAfter("done");
    const ok = await onLog("done", extra);
    if (ok) setTimeout(onClose, 1500);
    else setAfter(null);
  }
  // A count that's already met can keep going: each slide adds one more (an eighth glass of water).
  async function more() {
    setAfter("more");
    const ok = await onLog("done", { amount: 1 });
    if (ok) setTimeout(onClose, 1500);
    else setAfter(null);
  }
  async function skip() {
    setAfter("skip");
    const ok = await onLog("skip");
    if (ok) setTimeout(onClose, 900);
    else setAfter(null);
  }

  if (after === "done")
    return (
      <Sheet onClose={onClose} label={`${h.name} logged`}>
        <div className="hb-landed" style={paint(h.colour)}>
          <OatcakeBiscuit eating className="hb-landed-mark" />
          <h2>{h.kind === "session" ? `Nice ${h.name.toLowerCase()}` : `${h.name}, done`}</h2>
          <p>{s.streak + 1} {s.unit === "wk" ? "weeks" : "days"} and counting. An oatcake for Pickle.</p>
        </div>
      </Sheet>
    );
  if (after === "more")
    return (
      <Sheet onClose={onClose} label={`${h.name} logged`}>
        <div className="hb-landed" style={{ ["--c" as string]: h.colour }}>
          <OatcakeBiscuit eating className="hb-landed-mark" />
          <h2>{amountLabel(h, Math.round(day.amount) + 1) || `${Math.round(day.amount) + 1}`} {when}</h2>
          <p>{Math.round(day.amount) + 1 - h.per_day} over your {h.per_day}. Going above and beyond.</p>
        </div>
      </Sheet>
    );
  if (after === "skip")
    return (
      <Sheet onClose={onClose} label={`${h.name} skipped`}>
        <div className="hb-landed" style={paint(h.colour)}>
          <h2>Skipped {when}</h2>
          <p>Your streak's safe. Rest counts too.</p>
        </div>
      </Sheet>
    );

  return (
    <Sheet onClose={onClose} label={`Log ${h.name}`}>
      <div className="hb-log" style={paint(h.colour)}>
        <p className="hb-eyebrow">{finished ? (day.done ? "Logged" : "Skipped") : `Log it · ${when}`}</p>
        <h2 className="hb-log-title"><span className="hb-ic"><HabitIcon name={h.icon} /></span>{h.name}</h2>
        <p className="hb-log-sub">{paceLabel(h)}{h.freq === "times" ? ` · ${s.periodDone} of ${s.periodGoal} so far` : ""}</p>

        {finished ? (
          <div className="hb-log-done">
            {day.done && <p>{day.logs.filter((l) => l.status === "done").map((l) => [l.amount != null && h.kind !== "count" ? amountLabel(h, Number(l.amount)) : "", l.feel ? FEELS.find((f) => f.key === l.feel)?.label : "", l.note].filter(Boolean).join(" · ")).filter(Boolean).join(", ") || "Done"}</p>}
            {day.done && h.kind === "count" && (
              <p className="hb-hint">{Math.round(day.amount)} of {h.per_day}{day.amount > h.per_day ? `, ${Math.round(day.amount - h.per_day)} extra` : ""}. Did more? Slide to add one.</p>
            )}
            {!readOnly && day.done && h.kind === "count" && <Slider h={h} onDone={more} doneText="slide to add one more" />}
            {!readOnly && <button type="button" className="btn plain" onClick={() => { onUndo(); onClose(); }}>Undo {when}</button>}
          </div>
        ) : (
          <>
            {h.kind === "session" && (
              <>
                <Dial h={h} value={amount} onValue={setAmount} usual={s.usual} />
                {s.usual != null && <p className="hb-hint">Your usual is {amountLabel(h, s.usual)}{s.longest != null && s.longest > s.usual ? `. Longest yet ${amountLabel(h, s.longest)}` : ""}</p>}
                <div className="hb-feel" role="radiogroup" aria-label="How did it feel?">
                  {FEELS.map((f) => (
                    <button key={f.key} type="button" role="radio" aria-checked={feel === f.key} onClick={() => setFeel(feel === f.key ? null : f.key)}>{f.label}</button>
                  ))}
                </div>
              </>
            )}
            {h.kind === "count" && (
              <>
                <div className="hb-taps">
                  {Array.from({ length: Math.min(24, Math.ceil(h.per_day)) }, (_, i) => {
                    const on = i < already + taps;
                    const locked = i < already;
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`hb-tap${on ? " on" : ""}${h.labels[i] ? " labelled" : ""}`}
                        disabled={locked}
                        onClick={() => setTaps(i + 1 - already === taps ? i - already : i + 1 - already)}
                        aria-pressed={on}
                      >
                        <span className="hb-tap-fill" />
                        {h.labels[i] ? <span className="hb-tap-label">{h.labels[i]}</span> : <HabitIcon name={h.icon} size={20} />}
                      </button>
                    );
                  })}
                </div>
                <p className="hb-hint">{taps ? `${already + taps} of ${h.per_day}` : already ? `${already} of ${h.per_day} so far. Tap to add, or slide for the rest` : `Tap to fill them in, or slide for all ${h.per_day}`}</p>
              </>
            )}
            {h.kind === "money" && (
              <div className="hb-money">
                <label>
                  <span>Spent {when}</span>
                  <span className="hb-money-box">£<NumberInput value={amount} onValue={setAmount} min={0} step="0.01" inputMode="decimal" /></span>
                </label>
                <div className="hb-bar big"><i style={{ width: `${Math.min(100, (amount / h.per_day) * 100)}%`, background: amount > h.per_day ? "var(--red)" : undefined }} /></div>
                <p className="hb-hint">{amount > h.per_day ? `£${(amount - h.per_day).toFixed(2)} over. Log it anyway, tomorrow's fresh.` : `£${(h.per_day - amount).toFixed(2)} left of £${h.per_day}`}</p>
              </div>
            )}
            {h.kind !== "count" && (
              <input className="hb-note" placeholder="Add a note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            )}
            {!readOnly && <Slider h={h} onDone={done} onSkip={skip} />}
          </>
        )}
        {!readOnly && <button type="button" className="hb-edit link" onClick={onEdit}>Edit habit</button>}
      </div>
    </Sheet>
  );
}

function Editor({ h, onClose, onSave, onRemove }: { h: Habit | null; onClose: () => void; onSave: (input: HabitInput) => Promise<string | null>; onRemove?: () => void }) {
  const [f, setF] = useState<HabitInput>(() =>
    h ?? { name: "", kind: "session", icon: "spark", colour: HABIT_COLOURS[0], unit: "min", per_day: 1, labels: [], freq: "times", days: [], times_per: 2, period_weeks: 1, part: "any", remind_at: null }
  );
  const [labels, setLabels] = useState((h?.labels ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: HabitInput) => setF((x) => ({ ...x, ...p }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await onSave({ ...f, labels: f.kind === "count" ? labels.split(",").map((s) => s.trim()).filter(Boolean) : [] });
    setBusy(false);
    setError(err);
  }
  return (
    <Sheet onClose={onClose} label={h ? `Edit ${h.name}` : "New habit"}>
      <form className="hb-form" onSubmit={save} style={paint(f.colour ?? HABIT_COLOURS[0])}>
        <h2>{h ? "Edit habit" : "New habit"}</h2>
        <input className="hb-name" placeholder="What's the habit?" value={f.name ?? ""} maxLength={80} autoFocus={!h} onChange={(e) => set({ name: e.target.value })} />

        <fieldset>
          <legend>Icon and colour</legend>
          <div className="hb-icons">
            {Object.keys(HABIT_ICONS).map((k) => (
              <button key={k} type="button" aria-label={k} aria-pressed={f.icon === k} onClick={() => set({ icon: k })}><HabitIcon name={k} /></button>
            ))}
          </div>
          <div className="hb-colours">
            {HABIT_COLOURS.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={f.colour === c} style={{ background: paint(c)["--c"] }} onClick={() => set({ colour: c })} />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>How you log it</legend>
          <div className="hb-opts">
            {([["session", "An amount", "km, minutes, pages"], ["count", "A count", "glasses, meals, times"], ["money", "Money", "spent against a budget"]] as const).map(([k, t, d]) => (
              <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => set({ kind: k, unit: k === "money" ? "£" : k === "count" ? "" : "min", per_day: k === "money" ? 20 : k === "count" ? 3 : 1 })}>
                <b>{t}</b><small>{d}</small>
              </button>
            ))}
          </div>
          {f.kind === "session" && (
            <label className="hb-field"><span>Measured in</span>
              <select value={f.unit ?? ""} onChange={(e) => set({ unit: e.target.value })}>
                <option value="min">minutes</option><option value="km">km</option><option value="miles">miles</option><option value="pages">pages</option><option value="reps">reps</option><option value="">nothing, just done</option>
              </select>
            </label>
          )}
          {f.kind === "count" && (
            <>
              <label className="hb-field"><span>How many a day</span><NumberInput value={Number(f.per_day) || 0} onValue={(n) => set({ per_day: n })} min={1} max={24} /></label>
              <label className="hb-field"><span>Name each one (optional)</span><input value={labels} placeholder="Breakfast, Lunch, Dinner" onChange={(e) => setLabels(e.target.value)} /></label>
            </>
          )}
          {f.kind === "money" && (
            <label className="hb-field"><span>Daily budget (£)</span><NumberInput value={Number(f.per_day) || 0} onValue={(n) => set({ per_day: n })} min={1} step="0.01" inputMode="decimal" /></label>
          )}
        </fieldset>

        <fieldset>
          <legend>How often</legend>
          <p className="hb-hint left">Start comfortably. Oatcake will offer to step it up when it's easy.</p>
          <div className="hb-opts three">
            {([["daily", "Every day"], ["days", "Some days"], ["times", "A few times"]] as const).map(([k, t]) => (
              <button key={k} type="button" aria-pressed={f.freq === k} onClick={() => set({ freq: k })}><b>{t}</b></button>
            ))}
          </div>
          {f.freq === "days" && (
            <div className="hb-weekdays">
              {WEEKDAYS.map((w, i) => (
                <button key={i} type="button" aria-pressed={f.days?.includes(i)} onClick={() => set({ days: f.days?.includes(i) ? f.days.filter((d) => d !== i) : [...(f.days ?? []), i] })}>{w}</button>
              ))}
            </div>
          )}
          {f.freq === "times" && (
            <div className="hb-times">
              <NumberInput value={Number(f.times_per) || 0} onValue={(n) => set({ times_per: n })} min={1} max={21} aria-label="Times" />
              <span>{(f.times_per ?? 1) === 1 ? "time" : "times"} every</span>
              <select value={f.period_weeks ?? 1} onChange={(e) => set({ period_weeks: Number(e.target.value) })} aria-label="Weeks">
                {[1, 2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n === 1 ? "week" : `${n} weeks`}</option>)}
              </select>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>When</legend>
          <div className="hb-opts four">
            {PARTS.map((p) => (
              <button key={p.key} type="button" aria-pressed={f.part === p.key} onClick={() => set({ part: p.key })}><HabitIcon name={p.icon} size={16} /><b>{p.label}</b></button>
            ))}
          </div>
          <label className="hb-field"><span>Nudge me at</span>
            <span className="hb-remind">
              <input type="time" value={f.remind_at?.slice(0, 5) ?? ""} onChange={(e) => set({ remind_at: e.target.value || null })} />
              {f.remind_at && <button type="button" className="link" onClick={() => set({ remind_at: null })}>No nudge</button>}
            </span>
          </label>
          <p className="hb-hint left">Only on days it's due and not logged yet. Turn on phone alerts in Account to get them.</p>
        </fieldset>

        {error && <p className="error">{error}</p>}
        <div className="hb-form-btns">
          {onRemove && <ConfirmButton label="Remove" ask="Remove this habit?" yes="Remove" onConfirm={onRemove} />}
          <button type="submit" className="btn" disabled={busy || !f.name?.trim() || (f.freq === "days" && !f.days?.length)}>{h ? "Save" : "Add habit"}</button>
        </div>
      </form>
    </Sheet>
  );
}

function WeekView({ habits, stats, byHabit, today, onPick, bare }: { habits: Habit[]; stats: Map<number, HabitStats>; byHabit: Map<number, Map<string, HabitLog[]>>; today: string; onPick: (id: number) => void; bare?: boolean }) {
  const hit = habits.filter((h) => stats.get(h.id)!.week >= 1).length;
  const checkIns = habits.reduce((a, h) => {
    const d = byHabit.get(h.id);
    let n = 0;
    for (let i = 0; i < 7; i++) if (dayOf(h, d?.get(addDays(mondayOf(today), i)) ?? []).done) n++;
    return a + n;
  }, 0);
  const best = habits.reduce<Habit | null>((b, h) => (!b || stats.get(h.id)!.streak > stats.get(b.id)!.streak ? h : b), null);
  return (
    <div className="hb-dark">
      <h2 className="hb-dark-title">This week</h2>
      <p className="hb-dark-sub">{hit === habits.length ? "Every goal hit. Lovely." : `${hit} of ${habits.length} goals hit so far.`}</p>
      <div className="hb-goals">
        {habits.map((h) => {
          const st = stats.get(h.id)!;
          const goal = Math.max(1, Math.min(14, st.periodGoal));
          const got = Math.min(goal, st.periodDone);
          return (
            <button key={h.id} type="button" className="hb-goal" style={paint(h.colour)} onClick={() => onPick(h.id)} aria-label={`${h.name}: ${got} of ${goal}`}>
              <span className="hb-ic"><HabitIcon name={h.icon} size={18} /></span>
              <span>
                <span className="hb-goal-top"><b>{h.name}</b><small>{paceLabel(h)}</small></span>
                <span className="hb-segs" aria-hidden="true">{Array.from({ length: goal }, (_, i) => <i key={i} className={i < got ? "on" : ""} />)}</span>
              </span>
              <span className={`hb-goal-n${got >= goal ? " hit" : ""}`}>{got}/{goal}</span>
            </button>
          );
        })}
      </div>
      {!bare && (
        <div className="hb-tiles">
          <Tile label="Check-ins" value={String(checkIns)} foot="This week" icon="check" />
          <Tile label="Longest streak" value={best ? `${stats.get(best.id)!.streak}` : "0"} foot={best ? best.name : ""} icon="flame" />
        </div>
      )}
    </div>
  );
}

const TILE_ICONS: Record<string, string> = {
  check: CHECK,
  flame: "M12 21a6 6 0 0 0 6-6c0-4-3-6-4.5-10-1 2.5-2 3.5-3.5 4.5C8 11 6 12.5 6 15a6 6 0 0 0 6 6Z",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4",
  run: "M4 12h4l2-5 4 10 2-5h4",
};
function Tile({ label, value, foot, icon, bar }: { label: string; value: string; foot?: string; icon: string; bar?: number }) {
  return (
    <div className="hb-tile">
      <small><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={TILE_ICONS[icon]} /></svg>{label}</small>
      <b>{value}</b>
      {bar != null ? <span className="hb-tile-bar"><i style={{ width: `${Math.min(1, bar) * 100}%` }} /></span> : <small>{foot}</small>}
    </div>
  );
}

function HabitTiles({ h, s }: { h: Habit; s: HabitStats }) {
  const u = s.unit === "wk" ? "wk" : "day";
  return (
    <div className="hb-tiles">
      <Tile label="Streak" value={`${s.streak} ${u}${s.streak === 1 ? "" : "s"}`} foot="Misses pause it, never reset it" icon="flame" />
      <Tile label="Best run" value={`${s.best}`} foot={`${u}s in a row`} icon="trophy" />
      <Tile label="Check-ins" value={`${s.checkIns}`} foot={`Since ${new Date(h.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`} icon="check" />
      <Tile label={h.freq === "times" ? "This stretch" : "This week"} value={`${s.periodDone}/${s.periodGoal}`} icon="run" bar={s.periodGoal ? s.periodDone / s.periodGoal : 0} />
    </div>
  );
}

function MonthView({ h, s, days, today, onDay, bare }: { h: Habit; s: HabitStats; days?: Map<string, HabitLog[]>; today: string; onDay?: (d: string) => void; bare?: boolean }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const cells = monthDays(month);
  const earliest = addDays(today, -14);
  return (
    <div className="hb-month" style={paint(h.colour)}>
      <div className="hb-month-nav">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <h3>{monthName(month)}</h3>
        <button type="button" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>
      <div className="hb-cal">
        {WEEKDAYS.map((w, i) => <span key={i} className="hb-wd">{w}</span>)}
        {cells.map((d) => {
          const day = dayOf(h, days?.get(d) ?? []);
          const out = d.slice(0, 7) !== month;
          const future = d > today;
          const counted = h.freq === "times" ? false : isScheduled(h, d);
          const cls = day.done ? "on" : day.skipped ? "skip" : !future && counted && d >= h.created_at.slice(0, 10) && d < today ? "miss" : "";
          const can = onDay && !future && d >= earliest;
          return (
            <button key={d} type="button" disabled={!can} className={`hb-day ${cls}${out ? " out" : ""}${d === today ? " today" : ""}`} onClick={() => can && onDay!(d)}>
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      {h.freq === "times" && <p className="hb-hint left">{paceLabel(h)}: counted from {new Date(periodStart(h, today) + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })}.</p>}
      {!bare && <HabitTiles h={h} s={s} />}
    </div>
  );
}

// Half a year on one screen, a column a week, darker the more you did that day.
function YearView({ h, s, days, today, bare, weeks = 26 }: { h: Habit; s: HabitStats; days?: Map<string, HabitLog[]>; today: string; bare?: boolean; weeks?: number }) {
  const [back, setBack] = useState(0);
  const end = addDays(mondayOf(today), 6 - back * weeks * 7);
  const start = addDays(end, -(weeks * 7 - 1));
  const cells: { d: string; level: number }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const day = dayOf(h, days?.get(d) ?? []);
    let level = 0;
    if (d > today) level = -1;
    else if (day.done) {
      const amt = h.kind === "session" && s.usual ? day.amount / s.usual : 1;
      level = amt >= 1.3 ? 4 : amt >= 0.9 ? 3 : 2;
    } else if (day.amount > 0) level = 1;
    cells.push({ d, level });
  }
  const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <div className="hb-dark" style={paint(h.colour)}>
      <div className="hb-year">
        <div className="hb-year-days">{WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}</div>
        <div className="hb-year-grid" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
          {cells.map((c) => <i key={c.d} className={`l${c.level}`} title={`${fmt(c.d)}`} />)}
        </div>
        <div className="hb-year-nav">
          <button type="button" aria-label="Earlier" disabled={weeks >= 52 || back >= 1} onClick={() => setBack(back + 1)}>‹</button>
          <span>{fmt(start)} – {fmt(end > today ? today : end)}</span>
          <button type="button" aria-label="Later" disabled={back === 0} onClick={() => setBack(back - 1)}>›</button>
        </div>
      </div>
      {!bare && <HabitTiles h={h} s={s} />}
    </div>
  );
}

// Desktop: everything at once, bento style. Today's list runs down the left; on the right, how
// today's going, the week, a tile per habit, and the picked habit's month, year and numbers.
function Bento({ habits, stats, byHabit, today, due, doneCount, focus, onFocus, todayList, onDay }: {
  habits: Habit[]; stats: Map<number, HabitStats>; byHabit: Map<number, Map<string, HabitLog[]>>; today: string;
  due: number; doneCount: number; focus?: Habit; onFocus: (id: number) => void; todayList: ReactNode; onDay?: (d: string) => void;
}) {
  const share = due ? doneCount / due : 0;
  const R = 54, C = 2 * Math.PI * R;
  const monday = mondayOf(today);
  let weekDone = 0;
  for (const h of habits) for (let i = 0; i < 7; i++) if (dayOf(h, byHabit.get(h.id)?.get(addDays(monday, i)) ?? []).done) weekDone++;
  const best = habits.reduce<Habit | null>((b, h) => (!b || stats.get(h.id)!.streak > stats.get(b.id)!.streak ? h : b), null);
  const fs = focus ? stats.get(focus.id)! : undefined;
  return (
    <div className="hb-bento">
      <div className="bt bt-today">{todayList}</div>

      <div className="bt bt-hero">
        <svg viewBox="0 0 128 128" className="bt-ring" aria-hidden="true">
          <circle cx="64" cy="64" r={R} className="bt-ring-track" />
          <circle cx="64" cy="64" r={R} className="bt-ring-fill" strokeDasharray={`${share * C} ${C}`} transform="rotate(-90 64 64)" />
        </svg>
        <div className="bt-hero-text">
          <b>{doneCount}<span>/{due}</span></b>
          <p>{due === 0 ? "Nothing due today" : doneCount === due ? "All done today" : "done today"}</p>
        </div>
        <div className="bt-hero-foot">
          <span><b>{weekDone}</b> check-ins this week</span>
          {best && stats.get(best.id)!.streak > 0 && <span><b>{stats.get(best.id)!.streak}</b> {best.name.toLowerCase()} streak</span>}
        </div>
      </div>

      <div className="bt bt-week">
        <WeekView habits={habits} stats={stats} byHabit={byHabit} today={today} onPick={onFocus} bare />
      </div>

      <div className="bt-minis">
        {habits.map((h) => {
          const s = stats.get(h.id)!;
          const days = byHabit.get(h.id);
          const start = addDays(monday, -7 * 11);
          return (
            <button key={h.id} type="button" className="bt bt-mini" aria-pressed={focus?.id === h.id} style={paint(h.colour)} onClick={() => onFocus(h.id)}>
              <span className="bt-mini-head"><span className="hb-ic"><HabitIcon name={h.icon} size={18} /></span><b>{h.name}</b></span>
              <span className="bt-mini-num">{s.streak}<small>{s.unit === "wk" ? " wk" : " day"}{s.streak === 1 ? "" : "s"}</small></span>
              <span className="bt-mini-grid" aria-hidden="true">
                {Array.from({ length: 84 }, (_, i) => {
                  const d = addDays(start, i);
                  const day = dayOf(h, days?.get(d) ?? []);
                  return <i key={d} className={d > today ? "f" : day.done ? "on" : day.amount > 0 ? "part" : ""} />;
                })}
              </span>
              <span className="bt-mini-foot">
                <span>{paceLabel(h)}</span>
                <span>{s.periodDone}/{s.periodGoal}</span>
              </span>
              <span className="hb-bar"><i style={{ width: `${s.periodGoal ? Math.min(1, s.periodDone / s.periodGoal) * 100 : 0}%`, background: "var(--c)" }} /></span>
            </button>
          );
        })}
      </div>

      {focus && fs && (
        <>
          <div className="bt bt-month"><MonthView key={focus.id} h={focus} s={fs} days={byHabit.get(focus.id)} today={today} onDay={onDay} bare /></div>
          <div className="bt bt-year" style={paint(focus.colour)}>
            <h3 className="bt-year-title"><HabitIcon name={focus.icon} size={16} />{focus.name} · the year</h3>
            <YearView key={focus.id} h={focus} s={fs} days={byHabit.get(focus.id)} today={today} bare weeks={52} />
            <HabitTiles h={focus} s={fs} />
          </div>
        </>
      )}
    </div>
  );
}

export type { Goal };
