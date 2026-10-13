"use client";

import { useState, useTransition } from "react";
import type { WorkspaceKind } from "@/lib/types";
import { MODES, clientsLogIn } from "@/lib/workspace";
import { setWorkMode } from "./actions";

// Who the work is for: Businesses, Customers or Just me. Switching away from Businesses asks first
// when it would pause anyone's login.
export default function WorkMode({ kind, loggedIn }: { kind: WorkspaceKind; loggedIn: number }) {
  const [asking, setAsking] = useState<WorkspaceKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (next: WorkspaceKind) =>
    start(async () => {
      setError(null);
      const res = await setWorkMode(next);
      if (res.error) setError(res.error);
      setAsking(null);
    });
  const pick = (next: WorkspaceKind) => {
    if (next === kind || pending) return;
    if (clientsLogIn(kind) && !clientsLogIn(next) && loggedIn > 0) setAsking(next);
    else save(next);
  };
  const target = MODES.find((m) => m.kind === asking);

  return (
    <>
      <div className="mode-pick" role="radiogroup" aria-label="Who is your work for?">
        {MODES.map((m) => (
          <button
            type="button"
            key={m.kind}
            role="radio"
            aria-checked={m.kind === kind}
            className={`mode-card${m.kind === kind ? " on" : ""}`}
            disabled={pending}
            onClick={() => pick(m.kind)}
          >
            <b>{m.title}</b>
            <small>{m.blurb}</small>
          </button>
        ))}
      </div>
      {target && (
        <div className="group mode-warn" role="alert">
          <div className="row stack">
            <b>Switch to {target.title}?</b>
            <span className="when">
              {loggedIn} {loggedIn === 1 ? "person" : "people"} at your businesses will lose access to Oatcake and stop getting emails.
              Their requests stay here, and switching back to Businesses lets them in again.
            </span>
            <span style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button type="button" className="btn small" disabled={pending} onClick={() => save(target.kind)}>{pending ? "Switching…" : `Switch to ${target.title}`}</button>
              <button type="button" className="btn small plain" disabled={pending} onClick={() => setAsking(null)}>Cancel</button>
            </span>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </>
  );
}
