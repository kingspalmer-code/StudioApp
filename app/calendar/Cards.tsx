"use client";

import { useMemo, useState } from "react";
import { addDays, byRank, cardColour, mapsLink, planSpan, type PlanItem } from "@/lib/plan";
import type { PlanPatch } from "./actions";

// To-do as a board of cards, after Kingsley's bento reference: each to-do a coloured card holding
// everything about it (when, where, steps, notes, job), grouped, resizable and recoloured, and
// ticked off with a pop. Built for brains that like to see it all and enjoy finishing things.

type Arrange = "groups" | "days";
const LOOSE = "";

export default function Cards({
  items,
  today,
  jobName,
  readOnly,
  arrange,
  onArrange,
  onSave,
  onOpen,
  onAdd,
}: {
  items: PlanItem[];
  today: string;
  jobName: Record<number, string>;
  readOnly: boolean;
  arrange: Arrange;
  onArrange: (a: Arrange) => void;
  onSave: (id: number, patch: PlanPatch) => void;
  onOpen: (id: number) => void;
  onAdd: (title: string, grp: string) => void;
}) {
  const [popping, setPopping] = useState<Set<number>>(new Set());
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [only, setOnly] = useState<string | null>(null);

  const tops = items.filter((i) => i.parent_id === null);
  const open = tops.filter((i) => !i.done_at).sort(byRank);
  const stepsOf = (id: number) => items.filter((i) => i.parent_id === id).sort(byRank);
  const doneToday = tops.filter((i) => i.done_at && i.done_at.slice(0, 10) === today);
  const dueToday = open.filter((i) => i.on_date && i.on_date <= today && (!i.end_date || i.end_date >= today || i.on_date === today));
  const groups = useMemo(() => [...new Set(open.map((i) => i.grp))].sort((a, b) => (a === LOOSE ? 1 : b === LOOSE ? -1 : a.localeCompare(b))), [open]);

  // Sections: by group, or by when.
  const sections: { key: string; title: string; items: PlanItem[] }[] =
    arrange === "groups"
      ? groups.filter((g) => only === null || only === g).map((g) => ({ key: g, title: g || "Loose ends", items: open.filter((i) => i.grp === g) }))
      : dayBuckets(open, today);

  const next = open
    .filter((i) => i.on_date && i.at_time && (i.on_date > today || i.on_date === today))
    .sort((a, b) => `${a.on_date}${a.at_time}`.localeCompare(`${b.on_date}${b.at_time}`))[0];

  function tick(i: PlanItem) {
    if (readOnly) return;
    setPopping((s) => new Set(s).add(i.id));
    setTimeout(() => {
      onSave(i.id, { done: true });
      setPopping((s) => { const x = new Set(s); x.delete(i.id); return x; });
    }, 650);
  }

  // Dropping a card on another puts it just before that one (and into its group); dropping on a
  // group's space puts it at the end of that group.
  function dropOn(target: PlanItem | null, grp: string | null) {
    const id = dragId;
    setDragId(null);
    setOver(null);
    if (id === null || readOnly || (target && target.id === id)) return;
    const others = open.filter((i) => i.id !== id);
    let rank: number;
    if (target) {
      const at = others.findIndex((i) => i.id === target.id);
      const lo = at > 0 ? others[at - 1].rank : target.rank - 2;
      rank = (lo + target.rank) / 2;
    } else {
      const inGroup = others.filter((i) => i.grp === grp);
      rank = (inGroup.length ? inGroup[inGroup.length - 1].rank : others.length ? others[others.length - 1].rank : 0) + 1;
    }
    const patch: PlanPatch = { rank };
    const g = target ? target.grp : grp;
    if (arrange === "groups" && g !== null) patch.grp = g;
    onSave(id, patch);
  }

  const todayDate = new Date(today + "T12:00:00Z");
  const total = doneToday.length + dueToday.length;

  return (
    <section className="cards" aria-label="To-do cards">
      <div className="cards-hero">
        <div className="hero-day">
          <b>{todayDate.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}</b>
          <span>{todayDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}</span>
        </div>
        <div className="hero-tile hero-done" style={{ ["--p" as string]: total ? doneToday.length / total : 0 }}>
          <span className="hero-k">Done today</span>
          <b>{doneToday.length}</b>
          <i className="hero-bar"><i /></i>
          <small>{dueToday.length ? `${dueToday.length} more on today` : doneToday.length ? "Today's all done 🎉" : "Nothing due today"}</small>
        </div>
        <button type="button" className="hero-tile hero-next" disabled={!next} onClick={() => next && onOpen(next.id)}>
          <span className="hero-k">Next up</span>
          {next ? (
            <>
              <b>{next.title}</b>
              <small>{planSpan(next, today)}{next.place ? ` · ${next.place}` : ""}</small>
            </>
          ) : (
            <small>Nothing with a time coming up.</small>
          )}
        </button>
      </div>

      <div className="cards-bar">
        <div className="seg" role="group" aria-label="Arrange by">
          <button type="button" aria-pressed={arrange === "groups"} onClick={() => onArrange("groups")}>Groups</button>
          <button type="button" aria-pressed={arrange === "days"} onClick={() => onArrange("days")}>Days</button>
        </div>
        {arrange === "groups" && groups.length > 1 && (
          <div className="cards-chips">
            <button type="button" aria-pressed={only === null} onClick={() => setOnly(null)}>All</button>
            {groups.map((g) => {
              const c = cardColour({ colour: null, grp: g, title: g || "Loose ends" });
              return (
                <button key={g || "loose"} type="button" aria-pressed={only === g} onClick={() => setOnly(only === g ? null : g)}>
                  <i style={{ background: c.bg }} />
                  {g || "Loose ends"}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {open.length === 0 && <p className="cards-empty">Nothing to do. Tell Oatcake what&apos;s on your mind and it&apos;ll fill this up.</p>}

      {sections.map((sec) => (
        <div
          key={sec.key || "loose"}
          className={`cards-sec${over === `sec:${sec.key}` ? " over" : ""}`}
          onDragOver={(e) => { if (dragId !== null) { e.preventDefault(); setOver(`sec:${sec.key}`); } }}
          onDragLeave={() => setOver((o) => (o === `sec:${sec.key}` ? null : o))}
          onDrop={(e) => { e.preventDefault(); dropOn(null, arrange === "groups" ? sec.key : null); }}
        >
          <h2 className="cards-h">
            {sec.title}
            <span>{sec.items.length}</span>
          </h2>
          <div className="cards-grid">
            {sec.items.map((i) => (
              <Card
                key={i.id}
                item={i}
                steps={stepsOf(i.id)}
                today={today}
                job={i.ticket_id ? jobName[i.ticket_id] : undefined}
                popping={popping.has(i.id)}
                lifted={dragId === i.id}
                over={over === `card:${i.id}`}
                readOnly={readOnly}
                onTick={() => tick(i)}
                onStep={(s) => onSave(s.id, { done: !s.done_at })}
                onOpen={() => onOpen(i.id)}
                onDragStart={() => setDragId(i.id)}
                onDragEnd={() => { setDragId(null); setOver(null); }}
                onDragOver={() => setOver(`card:${i.id}`)}
                onDrop={() => dropOn(i, null)}
              />
            ))}
            {!readOnly && arrange === "groups" && <NewCard grp={sec.key} onAdd={onAdd} />}
          </div>
        </div>
      ))}

      {!readOnly && arrange === "groups" && only === null && <NewGroup onAdd={onAdd} />}

      {doneToday.length > 0 && (
        <div className="cards-shelf" aria-label="Done today">
          <span className="hero-k">Done today</span>
          <div>
            {doneToday.map((i) => (
              <button key={i.id} type="button" className="shelf-chip" style={chipStyle(i)} onClick={() => !readOnly && onSave(i.id, { done: false })} title="Tap to put it back">
                ✓ {i.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const chipStyle = (i: PlanItem) => {
  const c = cardColour(i);
  return { background: c.bg, color: c.ink };
};

function Card({
  item,
  steps,
  today,
  job,
  popping,
  lifted,
  over,
  readOnly,
  onTick,
  onStep,
  onOpen,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  item: PlanItem;
  steps: PlanItem[];
  today: string;
  job?: string;
  popping: boolean;
  lifted: boolean;
  over: boolean;
  readOnly: boolean;
  onTick: () => void;
  onStep: (s: PlanItem) => void;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  const c = cardColour(item);
  const when = item.on_date ? planSpan(item, today) : "";
  const late = item.on_date && (item.end_date ?? item.on_date) < today;
  const left = steps.filter((s) => !s.done_at).length;
  const show = item.size === "s" ? 0 : item.size === "m" ? 4 : 8;
  return (
    <article
      className={`card size-${item.size}${c.key === "ink" ? " ink" : ""}${popping ? " pop" : ""}${lifted ? " lifted" : ""}${over ? " over" : ""}`}
      style={{ ["--bg" as string]: c.bg, ["--ink" as string]: c.ink }}
      draggable={!readOnly && item.id > 0}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver(); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}
      onClick={onOpen}
    >
      <div className="card-top">
        {when && <span className={`card-when${late ? " late" : ""}`}>{late ? "Overdue · " : ""}{when}</span>}
        {steps.length > 0 && <span className="card-count">{steps.length - left}/{steps.length}</span>}
      </div>
      <h3 className="card-title">{item.title}</h3>
      {item.place && (
        <a className="card-place" href={mapsLink(item.place)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15s5-4.6 5-8.5A5 5 0 0 0 3 6.5C3 10.4 8 15 8 15z" /><circle cx="8" cy="6.5" r="1.8" /></svg>
          {item.place}
        </a>
      )}
      {item.notes && item.size !== "s" && <p className="card-notes">{item.notes}</p>}
      {show > 0 && steps.length > 0 && (
        <ul className="card-steps">
          {steps.slice(0, show).map((s) => (
            <li key={s.id} className={s.done_at ? "done" : ""}>
              <button type="button" disabled={readOnly || s.id < 0} onClick={(e) => { e.stopPropagation(); onStep(s); }} aria-label={s.done_at ? `Untick ${s.title}` : `Tick ${s.title}`}>
                <i />
              </button>
              <span>{s.title}</span>
            </li>
          ))}
          {steps.length > show && <li className="more">+{steps.length - show} more</li>}
        </ul>
      )}
      <div className="card-foot">
        {job && <span className="card-job">{job}</span>}
        <button
          type="button"
          className="card-tick"
          disabled={readOnly || item.id < 0 || popping}
          aria-label={`Done: ${item.title}`}
          onClick={(e) => { e.stopPropagation(); onTick(); }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </button>
      </div>
      {popping && (
        <span className="card-burst" aria-hidden="true">
          {Array.from({ length: 12 }, (_, n) => <i key={n} style={{ ["--a" as string]: `${n * 30}deg` }} />)}
        </span>
      )}
    </article>
  );
}

function NewCard({ grp, onAdd }: { grp: string; onAdd: (title: string, grp: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form className="card card-new size-s" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAdd(v, grp); setV(""); } }}>
      <span aria-hidden="true">+</span>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Add a card" aria-label={`Add a card${grp ? ` to ${grp}` : ""}`} maxLength={300} />
    </form>
  );
}

function NewGroup({ onAdd }: { onAdd: (title: string, grp: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [first, setFirst] = useState("");
  if (!open) return <button type="button" className="cards-newgroup" onClick={() => setOpen(true)}>+ New group</button>;
  return (
    <form className="cards-newgroup-form" onSubmit={(e) => { e.preventDefault(); if (name.trim() && first.trim()) { onAdd(first, name.trim()); setOpen(false); setName(""); setFirst(""); } }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name, like London trip" aria-label="Group name" maxLength={60} autoFocus />
      <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First card in it" aria-label="First card" maxLength={300} />
      <button type="submit" disabled={!name.trim() || !first.trim()}>Add</button>
      <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}

// "Overdue", "Today", "Tomorrow", "This week", "Later", "Any time".
function dayBuckets(open: PlanItem[], today: string) {
  const tomorrow = addDays(today, 1);
  const week = addDays(today, 7);
  const last = (i: PlanItem) => i.end_date ?? i.on_date!;
  const buckets: { key: string; title: string; test: (i: PlanItem) => boolean }[] = [
    { key: "late", title: "Overdue", test: (i) => !!i.on_date && last(i) < today },
    { key: "today", title: "Today", test: (i) => !!i.on_date && i.on_date <= today && last(i) >= today },
    { key: "tomorrow", title: "Tomorrow", test: (i) => i.on_date === tomorrow },
    { key: "week", title: "Next 7 days", test: (i) => !!i.on_date && i.on_date > tomorrow && i.on_date <= week },
    { key: "later", title: "Later", test: (i) => !!i.on_date && i.on_date > week },
    { key: "any", title: "Any time", test: (i) => !i.on_date },
  ];
  const timeOrder = (a: PlanItem, b: PlanItem) => `${a.on_date ?? "9"}${a.at_time ?? "99"}`.localeCompare(`${b.on_date ?? "9"}${b.at_time ?? "99"}`) || a.rank - b.rank;
  return buckets
    .map((b) => ({ key: b.key, title: b.title, items: open.filter(b.test).sort(timeOrder) }))
    .filter((b) => b.items.length);
}
