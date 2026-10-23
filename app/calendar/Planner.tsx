"use client";

import "./calendar.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import TimeTracker from "@/components/TimeTracker";
import { fmtClock, fmtMinutes, totalMinutes, type TimeLog } from "@/lib/hours";
import { addDays, byRank, byTime, dayName, hhmm, monthDays, monthName, planWhen, REMIND_OPTIONS, shiftMonth, type PlanItem } from "@/lib/plan";
import { blockTime, routineOn, type RoutineBlock } from "@/lib/routine";
import { saveProfile } from "@/lib/supabase/client";
import { addPlanItem, removePlanItem, updatePlanItem, type PlanPatch } from "./actions";
import BrainDump from "./BrainDump";
import YourWeek from "./YourWeek";

type Job = { id: number; title: string };
type Person = { email: string; name: string; owner: boolean };

// Where a dragged to-do would land: on a day, between rows of the list, or off the calendar.
type Target = { day: string } | { before: number | null; parent: number | null } | { unplan: true };
type Drag = { id: number; x: number; y: number; target: Target | null };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const initials = (name: string) =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

export default function Planner({
  initial,
  initialLogs,
  jobs,
  team,
  me,
  today,
  startMonth,
  openId,
  newForJob,
  readOnly,
  routine: initialRoutine,
  brain,
  focusDump,
  top,
}: {
  initial: PlanItem[];
  initialLogs: TimeLog[];
  jobs: Job[];
  team: Person[];
  me: string;
  today: string;
  startMonth: string;
  openId?: number;
  newForJob?: Job;
  readOnly: boolean;
  routine: RoutineBlock[];
  // Whether "Tell Oatcake" is on (it needs the AI key).
  brain: boolean;
  focusDump?: boolean;
  // What sits between the heading and the calendar: an employee's tasks from the owner.
  top?: React.ReactNode;
}) {
  const [items, setItems] = useState(initial);
  const [logs, setLogs] = useState(initialLogs);
  const opened = openId ? initial.find((i) => i.id === openId) : undefined;
  const [month, setMonth] = useState(opened?.on_date?.slice(0, 7) ?? startMonth);
  const [selected, setSelected] = useState(opened?.on_date ?? today);
  const [editing, setEditing] = useState<number | null>(opened ? opened.id : null);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(opened ? [opened.parent_id ?? opened.id] : []));
  const [who, setWho] = useState<string>("all");
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [routine, setRoutine] = useState(initialRoutine);
  const [, startTransition] = useTransition();
  const tempId = useRef(-1);

  const jobName = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j.title])), [jobs]);
  const nameOf = useMemo(() => Object.fromEntries(team.map((p) => [p.email, p.name])), [team]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const shown = useMemo(() => (who === "all" ? items : items.filter((i) => i.owner === who)), [items, who]);
  const stepsOf = (id: number) => shown.filter((i) => i.parent_id === id).sort(byRank);
  const todos = shown.filter((i) => i.parent_id === null).sort(byRank);
  const open = todos.filter((t) => !t.done_at);
  const done = todos.filter((t) => t.done_at).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  const dated = shown.filter((i) => i.on_date);
  const onDay = (day: string) => dated.filter((i) => i.on_date === day).sort(byTime);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(t);
  }, [error]);

  // Saves a change after showing it. If the save fails, the item goes back to how it was.
  function save(id: number, patch: PlanPatch) {
    if (readOnly || id < 0) return;
    const before = byId.get(id);
    if (!before) return;
    const { done: isDone, ...fields } = patch;
    const next: PlanItem = { ...before, ...fields, ...(isDone === undefined ? {} : { done_at: isDone ? new Date().toISOString() : null }) };
    // Steps follow their to-do to another person or job.
    const follow = { ...(patch.owner ? { owner: patch.owner } : {}), ...("ticket_id" in patch ? { ticket_id: patch.ticket_id ?? null } : {}) };
    setItems((list) => list.map((i) => (i.id === id ? next : i.parent_id === id ? { ...i, ...follow } : i)));
    startTransition(async () => {
      const r = await updatePlanItem(id, patch).catch(() => ({ error: "Couldn't save that. Check your connection.", item: undefined }));
      if (r.error || !r.item) {
        setError(r.error || "Couldn't save that.");
        setItems((list) => list.map((i) => (i.id === id ? before : i)));
      } else {
        const saved = r.item;
        setItems((list) => list.map((i) => (i.id === id ? saved : i)));
      }
    });
  }

  function add(title: string, extra: { parent?: PlanItem; day?: string; job?: Job } = {}) {
    if (readOnly || !title.trim()) return;
    const parent = extra.parent;
    const siblings = items.filter((i) => i.parent_id === (parent?.id ?? null));
    const rank = siblings.reduce((m, i) => Math.max(m, i.rank), 0) + 1;
    const owner = parent?.owner ?? (who !== "all" ? who : me);
    const draft: PlanItem = {
      id: tempId.current--,
      owner,
      parent_id: parent?.id ?? null,
      ticket_id: parent?.ticket_id ?? extra.job?.id ?? null,
      title: title.trim(),
      notes: "",
      rank,
      on_date: extra.day ?? null,
      at_time: null,
      remind: 0,
      done_at: null,
      created_by: me,
    };
    setItems((list) => [...list, draft]);
    if (parent) setExpanded((s) => new Set(s).add(parent.id));
    startTransition(async () => {
      const r = await addPlanItem({ title: draft.title, parent_id: draft.parent_id, ticket_id: draft.ticket_id, owner, on_date: draft.on_date, rank }).catch(() => ({ error: "Couldn't add that. Check your connection.", item: undefined }));
      if (r.error || !r.item) {
        setError(r.error || "Couldn't add that.");
        setItems((list) => list.filter((i) => i.id !== draft.id));
      } else {
        const saved = r.item;
        setItems((list) => list.map((i) => (i.id === draft.id ? saved : i)));
        setEditing((e) => (e === draft.id ? saved.id : e));
      }
    });
  }

  // Your week is saved to your account; if that fails it goes back.
  function saveRoutine(next: RoutineBlock[]) {
    if (readOnly) return;
    const before = routine;
    setRoutine(next);
    startTransition(async () => {
      const { error: e } = await saveProfile({ data: { routine: next } }).catch(() => ({ error: { message: "Couldn't save that. Check your connection." } }));
      if (e) {
        setError(e.message || "Couldn't save your week.");
        setRoutine(before);
      }
    });
  }

  function remove(id: number) {
    if (readOnly) return;
    const before = items;
    setItems((list) => list.filter((i) => i.id !== id && i.parent_id !== id));
    setEditing(null);
    startTransition(async () => {
      const r = await removePlanItem(id).catch(() => ({ error: "Couldn't remove that. Check your connection." }));
      if (r.error) {
        setError(r.error);
        setItems(before);
      }
    });
  }

  // Priority: the new rank sits halfway between the neighbours it lands between.
  function rankBefore(beforeId: number | null, parent: number | null, moving: number) {
    const siblings = items.filter((i) => i.parent_id === parent && i.id !== moving && !i.done_at).sort(byRank);
    const at = beforeId === null ? siblings.length : siblings.findIndex((i) => i.id === beforeId);
    const lo = at > 0 ? siblings[at - 1].rank : null;
    const hi = at < siblings.length ? siblings[at].rank : null;
    if (lo === null && hi === null) return 1;
    if (lo === null) return hi! - 1;
    if (hi === null) return lo + 1;
    return (lo + hi) / 2;
  }

  // ---- Dragging, with the mouse or a finger: list rows by their number, calendar entries anywhere.
  const press = useRef<{ id: number; x: number; y: number; moved: boolean; tap?: () => void } | null>(null);

  function startPress(e: React.PointerEvent, id: number, tap?: () => void) {
    if (readOnly || e.button !== 0 || id < 0) {
      if (tap && !readOnly) tap();
      return;
    }
    press.current = { id, x: e.clientX, y: e.clientY, moved: false, tap };
  }

  useEffect(() => {
    function targetAt(x: number, y: number, id: number): Target | null {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el) return null;
      const day = el.closest<HTMLElement>("[data-day]");
      if (day) return { day: day.dataset.day! };
      const moving = byId.get(id);
      const row = el.closest<HTMLElement>("[data-row]");
      if (row && moving) {
        const rowId = Number(row.dataset.row);
        const rowItem = byId.get(rowId);
        // Rows only reorder among their own kind: to-dos among to-dos, steps within their to-do.
        if (rowItem && rowItem.parent_id === moving.parent_id && rowId !== id) {
          const r = row.getBoundingClientRect();
          if (y < r.top + r.height / 2) return { before: rowId, parent: moving.parent_id };
          const sibs = items.filter((i) => i.parent_id === moving.parent_id && !i.done_at && i.id !== id).sort(byRank);
          const nextSib = sibs[sibs.findIndex((s) => s.id === rowId) + 1];
          return { before: nextSib?.id ?? null, parent: moving.parent_id };
        }
      }
      if (el.closest("[data-unplan]") && moving?.on_date) return { unplan: true };
      return null;
    }
    function move(e: PointerEvent) {
      const p = press.current;
      if (!p) return;
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      p.moved = true;
      e.preventDefault();
      setDrag({ id: p.id, x: e.clientX, y: e.clientY, target: targetAt(e.clientX, e.clientY, p.id) });
    }
    function up(e: PointerEvent) {
      const p = press.current;
      press.current = null;
      if (!p) return;
      if (!p.moved) {
        p.tap?.();
        return;
      }
      setDrag(null);
      const t = targetAt(e.clientX, e.clientY, p.id);
      if (!t) return;
      if ("day" in t) {
        save(p.id, { on_date: t.day });
        setSelected(t.day);
      } else if ("unplan" in t) save(p.id, { on_date: null, at_time: null });
      else save(p.id, { rank: rankBefore(t.before, t.parent, p.id) });
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });

  const dragging = drag ? byId.get(drag.id) : undefined;
  const t = drag?.target;
  const dropDay = t && "day" in t ? t.day : null;
  const dropBefore = t && "before" in t ? t : null;

  const editingItem = editing !== null ? byId.get(editing) : undefined;
  const days = monthDays(month);
  const [dd, mm] = [today.slice(8), today.slice(5, 7)];
  const todayCount = onDay(today).filter((i) => !i.done_at).length;
  const showWho = team.length > 1;

  // Hours on a to-do count its steps' too.
  const logsFor = (i: PlanItem) => logs.filter((l) => l.plan_item_id === i.id || (i.parent_id === null && l.plan_item_id !== null && byId.get(l.plan_item_id)?.parent_id === i.id));
  const meta = (i: PlanItem) => {
    const mins = totalMinutes(logsFor(i));
    return [
      i.parent_id === null && i.ticket_id ? jobName[i.ticket_id] : "",
      i.on_date ? planWhen(i.on_date, i.at_time, today) : "",
      mins ? fmtMinutes(mins) : "",
    ].filter(Boolean);
  };
  const running = logs.find((l) => l.minutes === null && l.who === me);

  return (
    <div className={`cal${drag ? " cal-dragging" : ""}`}>
      <header className="cal-head">
        <div>
          <h1 className="cal-title">To-do<span>.</span></h1>
          <p className="cal-sub">{todayCount ? `${todayCount} thing${todayCount === 1 ? "" : "s"} on today` : "Nothing on today"} · {open.length} to-do{open.length === 1 ? "" : "s"}</p>
        </div>
        <div className="cal-big" aria-label={`Today is ${dayName(today)}`}>
          {Number(dd)}<span>/{Number(mm)}</span>
        </div>
      </header>

      {running && <Running log={running} item={running.plan_item_id ? byId.get(running.plan_item_id) : undefined} job={running.ticket_id ? jobName[running.ticket_id] : undefined} onOpen={(id) => setEditing(id)} />}

      {top}

      {!readOnly && (
        <div className="cal-tools">
          {brain && (
            <BrainDump
              routine={routine}
              today={today}
              focus={focusDump}
              find={(id) => byId.get(id)}
              onChange={(c) => {
                if (c.remove) return remove(c.id);
                if (c.done) return save(c.id, { done: true });
                const item = byId.get(c.id);
                const patch: PlanPatch = {};
                if (c.title) patch.title = c.title;
                if (c.clear_date) Object.assign(patch, { on_date: null, at_time: null });
                else {
                  if (c.date) patch.on_date = c.date;
                  if (c.time && (c.date || item?.on_date)) patch.at_time = c.time;
                }
                if (Object.keys(patch).length) save(c.id, patch);
                const day = patch.on_date ?? (patch.at_time ? item?.on_date : null);
                if (day) { setSelected(day); setMonth(day.slice(0, 7)); }
              }}
              onAdded={(added) => {
                setItems((list) => [...list, ...added]);
                const step = added.find((i) => i.parent_id !== null);
                if (step) setExpanded((s) => new Set(s).add(step.parent_id!));
                const first = added.find((i) => i.on_date && i.on_date >= today);
                if (first) { setSelected(first.on_date!); setMonth(first.on_date!.slice(0, 7)); }
              }}
              onRoutine={(blocks) => saveRoutine([...routine, ...blocks.map((b) => ({ ...b, id: Math.random().toString(36).slice(2, 10) }))])}
            />
          )}
          <YourWeek routine={routine} onChange={saveRoutine} readOnly={readOnly} />
        </div>
      )}

      {showWho && (
        <div className="seg cal-who" role="group" aria-label="Show whose to-dos">
          <button type="button" aria-pressed={who === "all"} onClick={() => setWho("all")}>Everyone&apos;s</button>
          {team.map((p) => (
            <button key={p.email} type="button" aria-pressed={who === p.email} onClick={() => setWho(p.email)}>
              {p.email === me ? "Mine" : p.name}
            </button>
          ))}
        </div>
      )}

      <div className="cal-body">
        <section className="cal-month" aria-label={monthName(month)}>
          <div className="cal-nav">
            <h2>{monthName(month).split(" ")[0]} <span>{month.slice(0, 4)}</span></h2>
            <div>
              {month !== today.slice(0, 7) && (
                <button type="button" className="cal-today" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>Today</button>
              )}
              <button type="button" className="cal-arrow" aria-label="Last month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
              <button type="button" className="cal-arrow" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
            </div>
          </div>
          <div className="cal-grid">
            {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
            {days.map((day) => {
              const list = onDay(day);
              const out = day.slice(0, 7) !== month;
              const cls = ["cal-tile", out && "out", day === today && "today", day === selected && "sel", dropDay === day && "drop", day < today && "past"].filter(Boolean).join(" ");
              return (
                <div key={day} className={cls} data-day={day} onClick={() => setSelected(day)}>
                  <span className="cal-num">
                    {day.endsWith("-01") && out ? new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) + " " : ""}
                    {Number(day.slice(8))}
                  </span>
                  {routineOn(routine, day).length > 0 && (
                    <span className="cal-routine" title={routineOn(routine, day).map((b) => `${b.label} ${blockTime(b)}`).join(", ")}>
                      {routineOn(routine, day).map((b) => b.label).join(" · ")}
                    </span>
                  )}
                  <div className="cal-chips">
                    {list.slice(0, 3).map((i) => (
                      <div
                        key={i.id}
                        className={`cal-chip${i.done_at ? " done" : ""}${drag?.id === i.id ? " lifted" : ""}${i.owner !== me ? " theirs" : ""}`}
                        onPointerDown={(e) => { e.stopPropagation(); startPress(e, i.id, () => { setSelected(day); setEditing(i.id); }); }}
                        onClick={(e) => e.stopPropagation()}
                        title={i.title}
                      >
                        {i.at_time && <b>{hhmm(i.at_time)}</b>}
                        {i.title}
                      </div>
                    ))}
                    {list.length > 3 && <div className="cal-more">+{list.length - 3}</div>}
                  </div>
                  {list.length > 0 && (
                    <span className="cal-dots" aria-label={`${list.length} on this day`}>
                      {list.slice(0, 4).map((i) => <i key={i.id} className={i.done_at ? "done" : ""} />)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="cal-day">
            <h3>{selected === today ? "Today" : dayName(selected)}</h3>
            {routineOn(routine, selected).length > 0 && (
              <ul className="cal-agenda cal-agenda-routine" aria-label="Every week">
                {routineOn(routine, selected).map((b) => (
                  <li key={b.id}>
                    <span className="cal-time">{b.start}</span>
                    <span className="cal-open">{b.label}<small>{b.end ? `Until ${b.end} · every week` : "Every week"}</small></span>
                  </li>
                ))}
              </ul>
            )}
            {onDay(selected).length === 0 && <p className="cal-empty">Nothing planned. Add something, or drag a to-do onto a day.</p>}
            <ul className="cal-agenda">
              {onDay(selected).map((i) => {
                const parent = i.parent_id ? byId.get(i.parent_id) : undefined;
                return (
                  <li key={i.id} className={i.done_at ? "done" : ""}>
                    <Check item={i} onToggle={() => save(i.id, { done: !i.done_at })} disabled={readOnly} />
                    <span className="cal-time">{i.at_time ? hhmm(i.at_time) : "Any time"}</span>
                    <button type="button" className="cal-open" onClick={() => setEditing(i.id)}>
                      {i.title}
                      {(parent || i.ticket_id) && <small>{parent ? parent.title : jobName[i.ticket_id!]}</small>}
                    </button>
                    {i.owner !== me && <span className="cal-face" title={nameOf[i.owner]}>{initials(nameOf[i.owner] ?? i.owner)}</span>}
                  </li>
                );
              })}
            </ul>
            {!readOnly && <AddLine key={selected} placeholder={`Add to ${selected === today ? "today" : dayName(selected).split(",")[0]}`} onAdd={(v) => add(v, { day: selected })} />}
          </div>
        </section>

        <section className="cal-list" aria-label="To-do list">
          <div className="cal-list-head">
            <h2>In order</h2>
            <span>Most important first. Drag the numbers to reorder, or onto a day to plan it.</span>
          </div>
          {newForJob && !readOnly && (
            <div className="cal-forjob">
              <p>Plan the steps for <b>{newForJob.title}</b></p>
              <AddLine placeholder="Name the to-do" initial={newForJob.title} onAdd={(v) => add(v, { job: newForJob })} cta="Add" />
            </div>
          )}
          <ol className="cal-todos">
            {open.map((item, n) => {
              const steps = stepsOf(item.id);
              const left = steps.filter((s) => !s.done_at).length;
              const isOpen = expanded.has(item.id);
              return (
                <li key={item.id} className={dropBefore && dropBefore.parent === null && dropBefore.before === item.id ? "drop-before" : undefined}>
                  <Row
                    item={item}
                    n={n + 1}
                    meta={meta(item)}
                    face={item.owner !== me ? initials(nameOf[item.owner] ?? item.owner) : ""}
                    lifted={drag?.id === item.id}
                    readOnly={readOnly}
                    onGrip={(e) => startPress(e, item.id)}
                    onToggle={() => save(item.id, { done: true })}
                    onOpen={() => setEditing(item.id)}
                    extra={
                      <button
                        type="button"
                        className={`cal-steps-btn${steps.length ? "" : " none"}`}
                        aria-expanded={isOpen}
                        onClick={() => setExpanded((s) => { const x = new Set(s); if (x.has(item.id)) x.delete(item.id); else x.add(item.id); return x; })}
                      >
                        {steps.length ? `${steps.length - left}/${steps.length}` : "+ Steps"}
                      </button>
                    }
                  />
                  {isOpen && (
                    <ol className="cal-steps">
                      {steps.map((s) => (
                        <li key={s.id} className={dropBefore && dropBefore.parent === item.id && dropBefore.before === s.id ? "drop-before" : undefined}>
                          <Row
                            item={s}
                            meta={s.on_date ? [planWhen(s.on_date, s.at_time, today)] : []}
                            lifted={drag?.id === s.id}
                            readOnly={readOnly}
                            onGrip={(e) => startPress(e, s.id)}
                            onToggle={() => save(s.id, { done: !s.done_at })}
                            onOpen={() => setEditing(s.id)}
                          />
                        </li>
                      ))}
                      {dropBefore && dropBefore.parent === item.id && dropBefore.before === null && <li className="drop-end" />}
                      {!readOnly && (
                        <li>
                          <AddLine placeholder="Add a step" onAdd={(v) => add(v, { parent: item })} small />
                        </li>
                      )}
                    </ol>
                  )}
                </li>
              );
            })}
            {dropBefore && dropBefore.parent === null && dropBefore.before === null && <li className="drop-end" />}
          </ol>
          {open.length === 0 && <p className="cal-empty">Nothing to do. Add the first thing below.</p>}
          {!readOnly && <AddLine placeholder="Add a to-do" onAdd={(v) => add(v)} />}
          {drag && dragging?.on_date && <div className={`cal-unplan${t && "unplan" in t ? " on" : ""}`} data-unplan>Drop here to take it off the calendar</div>}
          {done.length > 0 && (
            <>
              <button type="button" className="cal-done-btn" onClick={() => setShowDone((s) => !s)}>
                {showDone ? "Hide" : "Show"} done ({done.length})
              </button>
              {showDone && (
                <ul className="cal-todos cal-done">
                  {done.map((item) => (
                    <li key={item.id}>
                      <Row item={item} meta={meta(item)} readOnly={readOnly} onToggle={() => save(item.id, { done: false })} onOpen={() => setEditing(item.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      {editingItem && (
        <Editor
          key={editingItem.id}
          item={editingItem}
          parent={editingItem.parent_id ? byId.get(editingItem.parent_id) : undefined}
          steps={editingItem.parent_id ? [] : stepsOf(editingItem.id)}
          jobs={jobs}
          team={team}
          me={me}
          today={today}
          readOnly={readOnly}
          hours={
            <TimeTracker
              logs={logs.filter((l) => l.plan_item_id === editingItem.id)}
              setLogs={setLogs}
              planItemId={editingItem.id}
              ticketId={editingItem.ticket_id}
              me={me}
              names={nameOf}
              canEditAll={team.find((p) => p.email === me)?.owner ?? false}
              readOnly={readOnly || editingItem.id < 0}
              today={today}
            />
          }
          onSave={(patch) => save(editingItem.id, patch)}
          onSaveStep={(id, patch) => save(id, patch)}
          onAddStep={(v) => add(v, { parent: editingItem })}
          onOpen={(id) => setEditing(id)}
          onRemove={() => remove(editingItem.id)}
          onClose={() => setEditing(null)}
        />
      )}

      {drag && dragging && (
        <div className="cal-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {dragging.title}
          {dropDay && <small>{planWhen(dropDay, dragging.at_time, today)}</small>}
        </div>
      )}
      {error && <div className="cal-error" role="alert">{error}</div>}
    </div>
  );
}

function Check({ item, onToggle, disabled }: { item: PlanItem; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`cal-check${item.done_at ? " on" : ""}`}
      aria-label={item.done_at ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
      aria-pressed={Boolean(item.done_at)}
      disabled={disabled || item.id < 0}
      onClick={onToggle}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
    </button>
  );
}

function Row({
  item,
  n,
  meta,
  face,
  lifted,
  readOnly,
  onGrip,
  onToggle,
  onOpen,
  extra,
}: {
  item: PlanItem;
  n?: number;
  meta: string[];
  face?: string;
  lifted?: boolean;
  readOnly: boolean;
  onGrip?: (e: React.PointerEvent) => void;
  onToggle: () => void;
  onOpen: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className={`cal-row${item.done_at ? " done" : ""}${lifted ? " lifted" : ""}${item.id < 0 ? " saving" : ""}`} data-row={item.id}>
      {onGrip && !readOnly ? (
        <span className={`cal-grip${n ? "" : " dot"}`} onPointerDown={onGrip} title="Drag to reorder, or onto a day">
          {n ? String(n).padStart(2, "0") : "⋮⋮"}
        </span>
      ) : n ? (
        <span className="cal-grip">{String(n).padStart(2, "0")}</span>
      ) : null}
      <Check item={item} onToggle={onToggle} disabled={readOnly} />
      <button type="button" className="cal-open" onClick={onOpen}>
        {item.title}
        {meta.length > 0 && <small>{meta.join(" · ")}</small>}
      </button>
      {face && <span className="cal-face">{face}</span>}
      {item.on_date && <span className="cal-dated" aria-label="On the calendar" />}
      {extra}
    </div>
  );
}

function AddLine({ placeholder, onAdd, initial = "", cta, small }: { placeholder: string; onAdd: (v: string) => void; initial?: string; cta?: string; small?: boolean }) {
  const [v, setV] = useState(initial);
  return (
    <form
      className={`cal-add${small ? " small" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v);
        setV("");
      }}
    >
      <span aria-hidden="true">+</span>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={300} />
      {(cta || v) && <button type="submit">{cta ?? "Add"}</button>}
    </form>
  );
}

function Editor({
  item,
  parent,
  steps,
  jobs,
  team,
  me,
  today,
  readOnly,
  hours,
  onSave,
  onSaveStep,
  onAddStep,
  onOpen,
  onRemove,
  onClose,
}: {
  item: PlanItem;
  parent?: PlanItem;
  steps: PlanItem[];
  jobs: Job[];
  team: Person[];
  me: string;
  today: string;
  readOnly: boolean;
  hours: React.ReactNode;
  onSave: (patch: PlanPatch) => void;
  onSaveStep: (id: number, patch: PlanPatch) => void;
  onAddStep: (title: string) => void;
  onOpen: (id: number) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const off = readOnly || item.id < 0;
  const job = item.ticket_id ? jobs.find((j) => j.id === item.ticket_id) : undefined;

  return (
    <>
      <div className="cal-scrim" onClick={onClose} />
      <aside className="cal-sheet" role="dialog" aria-label={item.title}>
        <div className="cal-sheet-top">
          {parent ? (
            <button type="button" className="cal-back" onClick={() => onOpen(parent.id)}>‹ {parent.title}</button>
          ) : (
            <span className="cal-kicker">{item.done_at ? "Done" : "To-do"}</span>
          )}
          <button type="button" className="cal-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="cal-sheet-title">
          <Check item={item} onToggle={() => onSave({ done: !item.done_at })} disabled={off} />
          <input
            value={title}
            disabled={off}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== item.title && onSave({ title })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            aria-label="Name"
          />
        </div>

        <div className="cal-fields">
          <label>
            Day
            <input type="date" value={item.on_date ?? ""} disabled={off} onChange={(e) => onSave({ on_date: e.target.value || null, ...(e.target.value ? {} : { at_time: null }) })} />
          </label>
          <label>
            Time
            <input type="time" value={hhmm(item.at_time)} disabled={off || !item.on_date} onChange={(e) => onSave({ at_time: e.target.value || null })} />
          </label>
          <div className="cal-quick">
            {[["Today", today], ["Tomorrow", addDays(today, 1)], ["Next week", addDays(today, 7)]].map(([label, d]) => (
              <button key={label} type="button" disabled={off} aria-pressed={item.on_date === d} onClick={() => onSave({ on_date: d })}>{label}</button>
            ))}
            {item.on_date && <button type="button" disabled={off} onClick={() => onSave({ on_date: null, at_time: null })}>No date</button>}
          </div>
          <label className="wide">
            Remind me
            <select value={item.remind ?? ""} disabled={off} onChange={(e) => onSave({ remind: e.target.value === "" ? null : Number(e.target.value) })}>
              {REMIND_OPTIONS.map((o) => <option key={String(o.value)} value={o.value ?? ""}>{o.label}</option>)}
            </select>
            {item.remind !== null && item.on_date && <small>{item.at_time ? "In the bell and on your phone." : "At 8am that day, in the bell and on your phone."}</small>}
            {item.remind !== null && !item.on_date && <small>Give it a day to get a reminder.</small>}
          </label>
          {!parent && jobs.length > 0 && (
            <label className="wide">
              Job
              <select value={item.ticket_id ?? ""} disabled={off} onChange={(e) => onSave({ ticket_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Not linked to a job</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
              {job && <Link href={`/tickets/${job.id}`} className="cal-joblink">Open {job.title} ›</Link>}
            </label>
          )}
          {!parent && team.length > 1 && (
            <label className="wide">
              Whose
              <select value={item.owner} disabled={off} onChange={(e) => onSave({ owner: e.target.value })}>
                {team.map((p) => <option key={p.email} value={p.email}>{p.email === me ? "Mine" : p.name}</option>)}
              </select>
            </label>
          )}
          <label className="wide">
            Notes
            <textarea rows={3} value={notes} disabled={off} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== item.notes && onSave({ notes })} placeholder="Anything to remember" />
          </label>
        </div>

        <div className="cal-sheet-hours">
          <h4>Hours</h4>
          <p className="cal-hint">{item.ticket_id ? "Counts towards the job, and adds up on its page." : "Link it to a job and the hours add up there too."}</p>
          {hours}
        </div>

        {!parent && (
          <div className="cal-sheet-steps">
            <h4>Steps</h4>
            <p className="cal-hint">Each step can have its own day and time.</p>
            <ul>
              {steps.map((s) => (
                <li key={s.id} className={s.done_at ? "done" : ""}>
                  <Check item={s} onToggle={() => onSaveStep(s.id, { done: !s.done_at })} disabled={readOnly} />
                  <button type="button" className="cal-open" onClick={() => onOpen(s.id)}>
                    {s.title}
                    <small>{s.on_date ? planWhen(s.on_date, s.at_time, today) : "No date yet"}</small>
                  </button>
                </li>
              ))}
            </ul>
            {!readOnly && <AddLine placeholder="Add a step" onAdd={onAddStep} small />}
          </div>
        )}

        {!readOnly && (
          <div className="cal-sheet-foot">
            <ConfirmButton label={parent ? "Remove step" : "Remove to-do"} ask={steps.length ? "Remove it and its steps?" : "Remove it?"} yes="Remove" onConfirm={onRemove} />
          </div>
        )}
      </aside>
    </>
  );
}

// A timer you have running, at the top of the calendar so it's never forgotten.
function Running({ log, item, job, onOpen }: { log: TimeLog; item?: PlanItem; job?: string; onOpen: (id: number) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <button type="button" className="cal-running" onClick={() => item && onOpen(item.id)}>
      <i />
      <b>{fmtClock(now - Date.parse(log.started_at!))}</b>
      <span>{item?.title ?? job ?? "Timer running"}</span>
    </button>
  );
}
