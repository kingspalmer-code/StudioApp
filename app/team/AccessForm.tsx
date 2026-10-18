"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PRESETS, presetFor, type Access, type Area, type Level } from "@/lib/access";
import { setEmployeeAccess } from "./actions";

const LEVELS: { key: Level; label: string }[] = [
  { key: "none", label: "None" },
  { key: "view", label: "View" },
  { key: "edit", label: "Edit" },
];

// Pick a ready-made set, or set each area to None, View or Edit, then save.
export default function AccessForm({ email, initial, areas, readOnly }: { email: string; initial: Access; areas: { key: Area; label: string; sub: string }[]; readOnly: boolean }) {
  const [access, setAccess] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const preset = presetFor(access);
  const changed = areas.some((a) => access[a.key] !== saved[a.key]);

  const save = () =>
    start(async () => {
      const res = await setEmployeeAccess(email, access);
      if (res.error) return setError(res.error);
      setError("");
      setSaved(access);
      router.refresh();
    });

  return (
    <>
      <p className="eyebrow">Start from</p>
      <div className="group">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" className="row nav-row access-preset" aria-pressed={preset === p.key} disabled={readOnly} onClick={() => setAccess(p.access)}>
            <div className="ctl">
              <div style={{ fontWeight: 600 }}>{p.label}</div>
              <div className="when">{p.sub}</div>
            </div>
            <span className="when">{preset === p.key ? "✓" : ""}</span>
          </button>
        ))}
      </div>

      <p className="eyebrow">Or choose for each part</p>
      <div className="group">
        {areas.map((a) => (
          <div className="row access-row" key={a.key}>
            <div className="ctl">
              <div style={{ fontWeight: 600 }}>{a.label}</div>
              <div className="when">{a.sub}</div>
            </div>
            <div className="seg" role="group" aria-label={a.label}>
              {LEVELS.map((l) => (
                <button key={l.key} type="button" aria-pressed={access[a.key] === l.key} disabled={readOnly} onClick={() => setAccess({ ...access, [a.key]: l.key })}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="foot">View lets them open those pages without changing anything. Edit lets them work there the way you do. Oatcake checks this on every change, not just in the menu.</p>
      {error && <p className="error">{error}</p>}
      {!readOnly && (
        <button className="btn wide" type="button" disabled={pending || !changed} onClick={save}>
          {pending ? "Saving…" : changed ? "Save access" : "Saved"}
        </button>
      )}
    </>
  );
}
