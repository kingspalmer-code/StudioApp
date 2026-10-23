"use client";

import { useEffect, useRef, useState } from "react";
import { CARD_COLOURS } from "@/lib/plan";
import { blockTime, DAY_SHORT, daysLabel, ROUTINE_COLOUR, type RoutineBlock } from "@/lib/routine";

// Your week: the things that happen every week. They show faintly on the calendar and Oatcake plans
// around them.
export default function YourWeek({ routine, onChange, readOnly }: { routine: RoutineBlock[]; onChange: (next: RoutineBlock[]) => void; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("");
  const [colour, setColour] = useState(ROUTINE_COLOUR);
  const [look, setLook] = useState<RoutineBlock["look"]>("fill");
  // Clicking or tapping anywhere outside the panel (or Escape) closes it.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !days.length || !start) return;
    onChange([...routine, { id: Math.random().toString(36).slice(2, 10), label: label.trim().slice(0, 60), days: [...days].sort(), start, end: end && end > start ? end : null, colour, look }]);
    setLabel("");
    setDays([]);
    setEnd("");
  }

  return (
    <div className="week" ref={box}>
      <button type="button" className="week-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Your week{routine.length ? ` · ${routine.length}` : ""}
      </button>
      {open && (
        <div className="week-panel">
          <p className="cal-hint">What happens every week, like office days or a regular train. Its days are coloured on the calendar and Oatcake plans around it.</p>
          {routine.length === 0 && <p className="cal-empty">Nothing yet.</p>}
          <ul className="week-list">
            {routine.map((b) => (
              <li key={b.id}>
                <span><b>{b.label}</b><small>{daysLabel(b.days)} · {blockTime(b)}</small></span>
                <Look colour={b.colour} look={b.look} disabled={readOnly} onChange={(p) => onChange(routine.map((x) => (x.id === b.id ? { ...x, ...p } : x)))} />
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
              <label>From <TimePick value={start} onChange={setStart} /></label>
              <label>Until <TimePick value={end} onChange={setEnd} empty="No end" /></label>
              <small>Pick “No end” for a one-off time, like a train.</small>
              <Look colour={colour} look={look} onChange={(p) => { if (p.colour) setColour(p.colour); if (p.look) setLook(p.look); }} wide />
              <button type="submit" disabled={!label.trim() || !days.length}>Add</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// Every quarter hour, as a list: Safari's time box rejects a time until AM/PM is typed too.
const TIMES = Array.from({ length: 96 }, (_, n) => `${String(Math.floor(n / 4)).padStart(2, "0")}:${String((n % 4) * 15).padStart(2, "0")}`);
const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

function TimePick({ value, onChange, empty }: { value: string; onChange: (v: string) => void; empty?: string }) {
  const times = value && !TIMES.includes(value) ? [...TIMES, value].sort() : TIMES;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {empty && <option value="">{empty}</option>}
      {times.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}
    </select>
  );
}

// The block's colour, and whether its days are filled in or outlined.
function Look({ colour, look, onChange, disabled, wide }: { colour: string; look: RoutineBlock["look"]; onChange: (p: Partial<Pick<RoutineBlock, "colour" | "look">>) => void; disabled?: boolean; wide?: boolean }) {
  const c = CARD_COLOURS.find((x) => x.key === colour) ?? CARD_COLOURS[5];
  const [open, setOpen] = useState(false);
  return (
    <div className={`week-look${wide ? " wide" : ""}`}>
      <button type="button" className={`week-swatch ${look}`} style={{ ["--wk" as string]: c.bg }} disabled={disabled} aria-expanded={open} aria-label={`${c.label}, ${look === "fill" ? "filled" : "outlined"}. Change`} onClick={() => setOpen((o) => !o)} />
      {(open || wide) && (
        <div className="week-look-pick">
          <div className="seg" role="group" aria-label="Look">
            <button type="button" aria-pressed={look === "fill"} onClick={() => onChange({ look: "fill" })}>Fill</button>
            <button type="button" aria-pressed={look === "outline"} onClick={() => onChange({ look: "outline" })}>Outline</button>
          </div>
          <div className="cal-swatches" role="group" aria-label="Colour">
            {CARD_COLOURS.map((x) => (
              <button key={x.key} type="button" aria-pressed={x.key === colour} style={{ background: x.bg }} title={x.label} aria-label={x.label} onClick={() => onChange({ colour: x.key })} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
