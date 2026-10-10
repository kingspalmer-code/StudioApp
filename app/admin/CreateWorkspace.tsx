"use client";

import { useActionState } from "react";
import { createWorkspace } from "./actions";

export default function CreateWorkspace() {
  const [state, action, pending] = useActionState(createWorkspace, null);
  return (
    <form action={action}>
      <p className="eyebrow">Set someone up</p>
      <div className="group">
        <div className="row">
          <label htmlFor="w-name">Workspace</label>
          <div className="ctl"><input id="w-name" name="name" required placeholder="Jan's Signs" /></div>
        </div>
        <div className="row">
          <label htmlFor="w-owner">Their name</label>
          <div className="ctl"><input id="w-owner" name="owner_name" required placeholder="Jan" /></div>
        </div>
        <div className="row">
          <label htmlFor="w-email">Their email</label>
          <div className="ctl"><input id="w-email" name="email" type="email" required placeholder="jan@example.com" /></div>
        </div>
        <div className="row">
          <label htmlFor="w-kind">Starter</label>
          <div className="ctl">
            <select id="w-kind" name="kind" defaultValue="trade">
              <option value="trade">Trade (quotes, building, customers)</option>
              <option value="studio">Design studio (requests from businesses)</option>
            </select>
          </div>
        </div>
      </div>
      <p className="foot">The starter sets their first stages and job types. They can change them in Settings.</p>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="foot" style={{ color: "var(--green)", fontWeight: 600 }}>{state.ok}</p>}
      <button className="btn wide" disabled={pending}>{pending ? "Creating…" : "Create workspace"}</button>
    </form>
  );
}
