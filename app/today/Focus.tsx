"use client";

import { useEffect, useRef, useState } from "react";
import OatcakeBiscuit from "@/components/OatcakeBiscuit";
import { flashSaved } from "@/components/Saved";
import { startTimer, stopTimer } from "@/app/hours/actions";
import { updatePlanItem } from "@/app/calendar/actions";
import { fmtClock } from "@/lib/hours";
import type { PlanItem } from "@/lib/plan";

// Focus: one thing on the whole screen, its steps, and a clock that counts up (never down, so
// there's nothing to run out). The time goes on the to-do's Hours, and on its job if it has one.
// Stopping early still counts; finishing ticks it off.
export default function Focus({ item, steps: startSteps, readOnly, onDone, onClose }: { item: PlanItem; steps: PlanItem[]; readOnly: boolean; onDone: () => void; onClose: () => void }) {
  const [steps, setSteps] = useState(startSteps);
  const [since] = useState(() => Date.now());
  const [now, setNow] = useState(since);
  const [finishing, setFinishing] = useState(false);
  const timer = useRef<Promise<number | null> | null>(null);

  useEffect(() => {
    if (!readOnly) timer.current = startTimer({ plan_item_id: item.id }).then((r) => r.log?.id ?? null, () => null);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [item.id, readOnly]);

  async function stop() {
    const id = await timer.current;
    timer.current = null;
    if (id) await stopTimer(id).catch(() => null);
  }

  async function finish(done: boolean) {
    if (finishing) return;
    setFinishing(true);
    await stop();
    const mins = Math.max(1, Math.round((Date.now() - since) / 60000));
    if (done) onDone();
    else {
      flashSaved(readOnly ? "Stopped" : `${mins} min logged. That counts.`);
      onClose();
    }
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && finish(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  function tickStep(s: PlanItem) {
    const done = !s.done_at;
    setSteps((all) => all.map((x) => (x.id === s.id ? { ...x, done_at: done ? new Date().toISOString() : null } : x)));
    if (!readOnly) updatePlanItem(s.id, { done });
  }

  const left = steps.filter((s) => !s.done_at).length;
  return (
    <div className="focus-layer" role="dialog" aria-modal="true" aria-label={`Focus: ${item.title}`}>
      <div className="focus-card">
        <p className="focus-eyebrow">Just this one</p>
        <h2 className="focus-title">{item.title}</h2>
        {item.notes && <p className="focus-notes">{item.notes}</p>}
        {steps.length > 0 && (
          <ul className="focus-steps">
            {steps.map((s) => (
              <li key={s.id} className={s.done_at ? "done" : ""}>
                <button type="button" onClick={() => tickStep(s)} aria-label={s.done_at ? `Untick ${s.title}` : `Tick ${s.title}`} aria-pressed={Boolean(s.done_at)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </button>
                <span>{s.title}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="focus-clock" aria-live="off">
          <OatcakeBiscuit small className="focus-biscuit" />
          <b>{fmtClock(now - since)}</b>
          <span>{steps.length ? (left ? `${left} step${left === 1 ? "" : "s"} to go` : "Every step done") : "Take it one bit at a time"}</span>
        </div>
        <div className="focus-btns">
          <button type="button" className="btn plain" onClick={() => finish(false)} disabled={finishing}>Stop for now</button>
          <button type="button" className="btn" onClick={() => finish(true)} disabled={finishing || readOnly}>It&apos;s done</button>
        </div>
      </div>
    </div>
  );
}
