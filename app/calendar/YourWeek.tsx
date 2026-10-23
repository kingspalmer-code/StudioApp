"use client";

import { useState } from "react";
import { blockTime, DAY_SHORT, daysLabel, type RoutineBlock } from "@/lib/routine";

// Your week: the things that happen every week. They show faintly on the calendar and Oatcake plans
// around them.
export default function YourWeek({ routine, onChange, readOnly }: { routine: RoutineBlock[]; onChange: (next: RoutineBlock[]) => void; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("");

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !days.length || !start) return;
    onChange([...routine, { id: Math.random().toString(36).slice(2, 10), label: label.trim().slice(0, 60), days: [...days].sort(), start, end: end && end > start ? end : null }]);
    setLabel("");
    setDays([]);
    setEnd("");
  }

  return (
    <div className="week">
      <button type="button" className="week-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Your week{routine.length ? ` · ${routine.length}` : ""}
      </button>
      {open && (
        <div className="week-panel">
          <p className="cal-hint">What happens every week, like office days or a regular train. It shows faintly on the calendar and Oatcake plans around it.</p>
          {routine.length === 0 && <p className="cal-empty">Nothing yet.</p>}
          <ul className="week-list">
            {routine.map((b) => (
              <li key={b.id}>
                <span><b>{b.label}</b><small>{daysLabel(b.days)} · {blockTime(b)}</small></span>
                {!readOnly && <button type="button" className="week-x" aria-label={`Remove ${b.label}`} onClick={() => onChange(routine.filter((x) => x.id !== b.id))}>×</button>}
              </li>
            ))}
          </ul>
          {!readOnly && (
            <form className="week-add" onSubmit={add}>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Office, Train to Leeds…" aria-label="What" maxLength={60} />
              <div className="week-days" role="group" aria-label="Days">
                {DAY_SHORT.map((d, i) => (
                  <button key={d} type="button" aria-pressed={days.includes(i + 1)} onClick={() => setDays((s) => (s.includes(i + 1) ? s.filter((x) => x !== i + 1) : [...s, i + 1]))}>{d[0]}</button>
                ))}
              </div>
              <label>From <input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
              <label>Until <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-describedby="week-until" /></label>
              <small id="week-until">Leave Until empty for a one-off time, like a train.</small>
              <button type="submit" disabled={!label.trim() || !days.length}>Add</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
