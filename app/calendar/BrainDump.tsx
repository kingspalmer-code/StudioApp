"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { planWhen, type PlanItem } from "@/lib/plan";
import { blockTime, clashWith, daysLabel, type RoutineBlock } from "@/lib/routine";
import { addBrainDump, readBrainDump, type DumpChange, type DumpItem, type DumpKind, type DumpRoutine } from "./brain";

const KIND_LABEL: Record<DumpKind, string> = { event: "On the calendar", todo: "To-do", get: "To get" };

type Row = DumpItem & { keep: boolean };
type Weekly = DumpRoutine & { keep: boolean };
type Change = DumpChange & { keep: boolean };

// What's typed (and any preview not yet added) stays on this computer, so leaving To-do and
// coming back doesn't lose it.
const DRAFT_KEY = "oatcake-tell-draft";
type Draft = { text: string; rows: Row[] | null; weekly: Weekly[]; changes: Change[] };
function loadDraft(): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    return d && typeof d.text === "string" ? { text: d.text, rows: Array.isArray(d.rows) ? d.rows : null, weekly: Array.isArray(d.weekly) ? d.weekly : [], changes: Array.isArray(d.changes) ? d.changes : [] } : null;
  } catch {
    return null;
  }
}
function saveDraft(d: Draft) {
  try {
    if (!d.text.trim() && !d.rows && !d.weekly.length && !d.changes.length) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {}
}

// "Tell Oatcake": type or dictate everything on your mind, Oatcake sorts it, you check it, it goes in.
export default function BrainDump({
  routine,
  today,
  focus,
  find,
  onAdded,
  onRoutine,
  onChange,
}: {
  routine: RoutineBlock[];
  today: string;
  focus?: boolean;
  // Something already on the list, to show what a change would do to it.
  find: (id: number) => PlanItem | undefined;
  onAdded: (items: PlanItem[]) => void;
  onRoutine: (blocks: DumpRoutine[]) => void;
  onChange: (change: DumpChange) => void;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [weekly, setWeekly] = useState<Weekly[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [reading, startReading] = useTransition();
  const [adding, startAdding] = useTransition();
  const loaded = useRef(false);

  useEffect(() => {
    const d = loadDraft();
    if (d) {
      setText(d.text);
      setRows(d.rows);
      setWeekly(d.weekly);
      setChanges(d.changes);
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current) saveDraft({ text, rows, weekly, changes });
  }, [text, rows, weekly, changes]);

  function read() {
    setError("");
    setNote("");
    startReading(async () => {
      const r = await readBrainDump(text, routine).catch(() => ({ error: "Couldn't reach Oatcake. Check your connection.", items: undefined, routine: undefined, changes: undefined }));
      if (r.error) return setError(r.error);
      setRows((r.items ?? []).map((i) => ({ ...i, keep: true })));
      setWeekly((r.routine ?? []).map((b) => ({ ...b, keep: true })));
      setChanges((r.changes ?? []).map((c) => ({ ...c, keep: true })));
    });
  }

  const change = (n: number, patch: Partial<Row>) => setRows((list) => list && list.map((r, i) => (i === n ? { ...r, ...patch } : r)));
  const kept = (rows ?? []).filter((r) => r.keep && r.title.trim());
  const keptWeekly = weekly.filter((b) => b.keep);
  // Changes to things that have since gone from the list are left out.
  const keptChanges = changes.filter((c) => c.keep && find(c.id));
  const total = kept.length + keptWeekly.length + keptChanges.length;

  // "Tue 27 Oct · 08:00", "Ticked off", "Renamed to …".
  function describe(c: DumpChange) {
    const item = find(c.id);
    if (!item) return "It's no longer on your list.";
    if (c.remove) return "Remove it";
    if (c.done) return "Tick it off";
    const bits: string[] = [];
    if (c.title && c.title !== item.title) bits.push(`Rename to “${c.title}”`);
    if (c.clear_date) bits.push("Take it off the calendar");
    else if (c.date || c.time) {
      const date = c.date ?? item.on_date;
      bits.push(date ? `Move to ${planWhen(date, c.time ?? item.at_time, today)}` : "Give it a day first to set a time");
    }
    return bits.join(" · ") || "No change";
  }

  function add() {
    setError("");
    startAdding(async () => {
      if (kept.length) {
        const r = await addBrainDump(kept.map(({ keep: _, ...i }) => i)).catch(() => ({ error: "Couldn't add those. Check your connection.", items: undefined }));
        if (r.error || !r.items) return setError(r.error || "Couldn't add those.");
        onAdded(r.items);
      }
      if (keptWeekly.length) onRoutine(keptWeekly.map(({ keep: _, ...b }) => b));
      for (const { keep: _, ...c } of keptChanges) onChange(c);
      const bits = [
        kept.length ? `${kept.length} thing${kept.length === 1 ? "" : "s"} added` : "",
        keptChanges.length ? `${keptChanges.length} changed` : "",
        keptWeekly.length ? `${keptWeekly.length} added to your week` : "",
      ].filter(Boolean);
      setNote(`✓ ${bits.join(", ")}`);
      setRows(null);
      setWeekly([]);
      setChanges([]);
      setText("");
    });
  }

  return (
    <section className="dump" aria-label="Tell Oatcake">
      {!rows ? (
        <>
          <label className="dump-label" htmlFor="dump-text">Tell Oatcake</label>
          <textarea
            id="dump-text"
            className="dump-text"
            rows={text ? 4 : 2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) read(); }}
            placeholder="Everything on your mind, however it comes out. Leather cleaner for my shoes, photoshoot Tuesday at 9, gig shoot 7th November, office Tue and Thu 8 till 4, move the HopRocket shoot to 8am…"
            maxLength={4000}
            autoFocus={focus}
            disabled={reading}
          />
          <div className="dump-foot">
            <span>{note || "Tip: use your keyboard's microphone to just talk."}</span>
            <button type="button" className="dump-go" disabled={!text.trim() || reading} onClick={read}>
              {reading ? "Sorting…" : "Sort it out"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="dump-head">
            <span className="dump-label">Here&apos;s what Oatcake heard</span>
            <span className="dump-hint">Untick or change anything, then add.</span>
          </div>
          <ul className="dump-rows">
            {rows.map((r, n) => {
              const clash = r.kind !== "get" ? clashWith(routine, r.date, r.time) : undefined;
              return (
                <li key={n} className={r.keep ? "" : "off"}>
                  <input type="checkbox" checked={r.keep} onChange={(e) => change(n, { keep: e.target.checked })} aria-label={`Add ${r.title}`} />
                  <div className="dump-main">
                    <input className="dump-title" value={r.title} onChange={(e) => change(n, { title: e.target.value })} aria-label="Name" maxLength={300} />
                    <div className="dump-when">
                      <select value={r.kind} onChange={(e) => change(n, { kind: e.target.value as DumpKind })} aria-label="Where it goes">
                        {(Object.keys(KIND_LABEL) as DumpKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                      </select>
                      <input type="date" value={r.date ?? ""} onChange={(e) => change(n, { date: e.target.value || null, ...(e.target.value ? {} : { time: null }) })} aria-label="Day" />
                      <input type="time" value={r.time ?? ""} disabled={!r.date} onChange={(e) => change(n, { time: e.target.value || null })} aria-label="Time" />
                    </div>
                    {r.date && <small>{planWhen(r.date, r.time, today)}{r.notes ? ` · ${r.notes}` : ""}</small>}
                    {!r.date && r.notes && <small>{r.notes}</small>}
                    {clash && <small className="dump-clash">That&apos;s during {clash.label} ({blockTime(clash)}).</small>}
                  </div>
                </li>
              );
            })}
            {changes.map((c, n) => (
              <li key={`c${n}`} className={`dump-change${c.keep ? "" : " off"}`}>
                <input type="checkbox" checked={c.keep} disabled={!find(c.id)} onChange={(e) => setChanges((list) => list.map((x, i) => (i === n ? { ...x, keep: e.target.checked } : x)))} aria-label={`Change ${c.was}`} />
                <div className="dump-main">
                  <span className="dump-title"><em>Change</em> {find(c.id)?.title ?? c.was}</span>
                  <small>{describe(c)}</small>
                </div>
              </li>
            ))}
            {weekly.map((b, n) => (
              <li key={`w${n}`} className={`dump-weekly${b.keep ? "" : " off"}`}>
                <input type="checkbox" checked={b.keep} onChange={(e) => setWeekly((list) => list.map((x, i) => (i === n ? { ...x, keep: e.target.checked } : x)))} aria-label={`Add ${b.label} to your week`} />
                <div className="dump-main">
                  <span className="dump-title">{b.label}</span>
                  <small>Every week · {daysLabel(b.days)} · {blockTime(b)}. Goes in Your week.</small>
                </div>
              </li>
            ))}
          </ul>
          <div className="dump-foot">
            <button type="button" className="dump-back" onClick={() => { setRows(null); setWeekly([]); setChanges([]); }} disabled={adding}>Back</button>
            <button type="button" className="dump-go" disabled={adding || total === 0} onClick={add}>
              {adding ? "Saving…" : keptChanges.length && !kept.length && !keptWeekly.length ? `Make ${total} change${total === 1 ? "" : "s"}` : keptChanges.length ? `Add and change ${total}` : `Add ${total}`}
            </button>
          </div>
        </>
      )}
      {error && <p className="dump-error" role="alert">{error}</p>}
    </section>
  );
}
