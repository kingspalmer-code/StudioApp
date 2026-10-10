"use client";

import { useActionState, useState } from "react";
import { addMember } from "@/app/actions";
import type { Business } from "@/lib/types";

export default function AddMember({ businesses }: { businesses: Business[] }) {
  const [error, action, pending] = useActionState(addMember, null);
  const [role, setRole] = useState("client");
  return (
    <form action={action}>
      <p className="eyebrow">Add someone</p>
      <div className="group">
        <div className="row">
          <label htmlFor="m-name">Name</label>
          <div className="ctl"><input id="m-name" name="full_name" placeholder="Their name" /></div>
        </div>
        <div className="row">
          <label htmlFor="m-email">Email</label>
          <div className="ctl"><input id="m-email" name="email" type="email" required placeholder="name@business.com" /></div>
        </div>
        <div className="row">
          <label htmlFor="m-role">Role</label>
          <div className="ctl">
            <select id="m-role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="client">Client (one business)</option>
              <option value="manager">Manager (overview)</option>
              <option value="designer">Designer (everything)</option>
            </select>
          </div>
        </div>
        {role === "client" && (
          <div className="row">
            <label htmlFor="m-biz">Business</label>
            <div className="ctl">
              <select id="m-biz" name="business_id" required>
                {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
      <p className="foot">They sign in at this site with that email. No invite email is sent, so let them know.</p>
      {error && <p className="error">{error}</p>}
      <button className="btn wide" disabled={pending}>{pending ? "Adding…" : "Add person"}</button>
    </form>
  );
}
