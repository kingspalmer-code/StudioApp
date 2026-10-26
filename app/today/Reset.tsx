"use client";

import { useState, useTransition } from "react";
import { flashSaved } from "@/components/Saved";
import { removePlanItem, updatePlanItem } from "@/app/calendar/actions";
import type { PlanItem } from "@/lib/plan";

type Step = "back" | "go" | "pick";
const LET_GO_SHOWN = 15;
const PICKS = 3;

// The weekly reset: five minutes, three steps. Look back at what got done (and nothing about what
// didn't), let go of what no longer matters, then choose the few things for the week ahead. Picks
// land on the first day of it, so Today offers them.
export default function Reset({
  done,
  habitDays,
  open,
  startDay,
  readOnly,
  onFinish,
  onClose,
}: {
  done: PlanItem[];
  habitDays: number;
  open: PlanItem[];
  startDay: string;
  readOnly: boolean;
  onFinish: (gone: number[], picked: number[]) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("back");
  const [letGo, setLetGo] = useState<Set<number>>(new Set());
  const [picked, setPicked] = useState<number[]>([]);
  const [saving, start] = useTransition();
  const kept = open.filter((i) => !letGo.has(i.id));

  const toggle = (set: Set<number>, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  function save() {
    start(async () => {
      if (!readOnly)
        await Promise.all([
          ...[...letGo].map((id) => removePlanItem(id)),
          ...picked.map((id) => updatePlanItem(id, { on_date: startDay, end_date: null })),
        ]);
      flashSaved(picked.length ? "Your week's set" : "Done for this week");
      onFinish([...letGo], picked);
    });
  }

  return (
    <div className="focus-layer" role="dialog" aria-modal="true" aria-label="Weekly reset">
      <div className="focus-card reset-card">
        <div className="reset-head">
          <p className="focus-eyebrow">Weekly reset · {step === "back" ? "1" : step === "go" ? "2" : "3"} of 3</p>
          <button type="button" className="link" onClick={onClose}>Not now</button>
        </div>

        {step === "back" && (
          <>
            <h2 className="focus-title">{done.length ? `You got ${done.length} thing${done.length === 1 ? "" : "s"} done this week` : "A quiet week. That's allowed."}</h2>
            {habitDays > 0 && <p className="focus-notes">And {habitDays} habit check-in{habitDays === 1 ? "" : "s"} on top.</p>}
            {done.length > 0 && (
              <ul className="reset-list done">
                {done.slice(0, 10).map((i) => <li key={i.id}>{i.title}</li>)}
                {done.length > 10 && <li className="more">and {done.length - 10} more</li>}
              </ul>
            )}
            <div className="focus-btns">
              <button type="button" className="btn" onClick={() => setStep(open.length ? "go" : "pick")}>Next</button>
            </div>
          </>
        )}

        {step === "go" && (
          <>
            <h2 className="focus-title">Anything to let go of?</h2>
            <p className="focus-notes">Tap what no longer matters. Letting go is a choice, not a failure.</p>
            <ul className="reset-list pickable">
              {open.slice(0, LET_GO_SHOWN).map((i) => (
                <li key={i.id}>
                  <button type="button" aria-pressed={letGo.has(i.id)} onClick={() => setLetGo((s) => toggle(s, i.id))}>
                    <span>{i.title}</span>
                    <small>{letGo.has(i.id) ? "Let go" : "Keep"}</small>
                  </button>
                </li>
              ))}
              {open.length > LET_GO_SHOWN && <li className="more">{open.length - LET_GO_SHOWN} more on your To-do</li>}
            </ul>
            <div className="focus-btns">
              <button type="button" className="btn plain" onClick={() => setStep("back")}>Back</button>
              <button type="button" className="btn" onClick={() => setStep("pick")}>{letGo.size ? `Let ${letGo.size} go` : "Keep them all"}</button>
            </div>
          </>
        )}

        {step === "pick" && (
          <>
            <h2 className="focus-title">What are this week&apos;s few things?</h2>
            <p className="focus-notes">Up to three. They&apos;ll be waiting on Today. Everything else stays on your To-do.</p>
            {kept.length ? (
              <ul className="reset-list pickable">
                {kept.slice(0, LET_GO_SHOWN).map((i) => {
                  const on = picked.includes(i.id);
                  return (
                    <li key={i.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        disabled={!on && picked.length >= PICKS}
                        onClick={() => setPicked((p) => (on ? p.filter((x) => x !== i.id) : [...p, i.id]))}
                      >
                        <span>{i.title}</span>
                        <small>{on ? `Pick ${picked.indexOf(i.id) + 1}` : ""}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="focus-notes">Your list is clear. Add things on Today whenever they come up.</p>
            )}
            <div className="focus-btns">
              <button type="button" className="btn plain" onClick={() => setStep(open.length ? "go" : "back")}>Back</button>
              <button type="button" className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Finish"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
