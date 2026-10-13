"use client";

import { useActionState } from "react";
import { addEmployee } from "@/app/tasks/actions";
import InviteLink from "./InviteLink";

export default function AddEmployee({ origin }: { origin: string }) {
  const [state, action, pending] = useActionState(addEmployee, null);
  return (
    <form action={action} id="add">
      <p className="eyebrow">Add an employee</p>
      <div className="group">
        <div className="row">
          <label htmlFor="e-name">Name</label>
          <div className="ctl"><input id="e-name" name="full_name" placeholder="Their name" /></div>
        </div>
        <div className="row">
          <label htmlFor="e-email">Email</label>
          <div className="ctl"><input id="e-email" name="email" type="email" required placeholder="name@example.com" /></div>
        </div>
      </div>
      <p className="foot">We&apos;ll email them a link to sign in. All they&apos;ll see is the to-do list you set them.</p>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="foot" style={{ color: "var(--green)", fontWeight: 600 }}>{state.ok}</p>}
      {state?.email && <div className="foot"><InviteLink url={`${origin}/login?email=${encodeURIComponent(state.email)}`} /></div>}
      <button className="btn wide" disabled={pending}>{pending ? "Adding…" : "Add employee"}</button>
    </form>
  );
}
