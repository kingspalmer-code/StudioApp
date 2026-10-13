"use client";

import { useState, useTransition } from "react";
import FieldInput from "@/components/FieldInput";
import { groupFields } from "@/lib/fields";
import { todayISO } from "@/lib/priority";
import { sendLinkRequest, type LinkForm } from "./actions";

export default function RequestLinkForm({ slug, form, name, email }: { slug: string; form: LinkForm; name: string; email: string }) {
  const [type, setType] = useState(form.types[0]?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const typeRow = form.types.find((t) => t.name === type);
  // Questions can be limited to some kinds of job; headings with nothing under them drop out.
  const groups = groupFields(form.fields.filter((f) => !f.type_ids?.length || (typeRow && f.type_ids.includes(typeRow.id))));

  if (sent)
    return (
      <div className="group">
        <div className="row stack">
          <b>Sent. Thank you.</b>
          <span className="when">{form.name} has your request. Check your email for a link to follow it, and reply to them from there.</span>
        </div>
      </div>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          setError(null);
          const res = await sendLinkRequest(slug, data);
          if (res.error) setError(res.error);
          else setSent(true);
        });
      }}
    >
      <p className="eyebrow">You</p>
      <div className="group">
        <div className="row"><label htmlFor="name">Your name</label><div className="ctl"><input id="name" name="name" required autoComplete="name" defaultValue={name} maxLength={80} /></div></div>
        <div className="row"><label htmlFor="email">Email</label><div className="ctl"><input id="email" name="email" type="email" required autoComplete="email" defaultValue={email} /></div></div>
        <div className="row"><label htmlFor="phone">Phone</label><div className="ctl"><input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="Optional" maxLength={40} /></div></div>
      </div>

      <p className="eyebrow">The job</p>
      <div className="group">
        <div className="row"><label htmlFor="title">What is it?</label><div className="ctl"><input id="title" name="title" required maxLength={120} placeholder="e.g. House name sign" /></div></div>
        {form.types.length > 1 && (
          <div className="row">
            <label htmlFor="type">Kind of job</label>
            <div className="ctl">
              <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
                {form.types.map((t) => <option key={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        )}
        {form.types.length === 1 && <input type="hidden" name="type" value={type} />}
        <div className="row"><label htmlFor="deadline">Needed by</label><div className="ctl"><input id="deadline" name="deadline" type="date" min={todayISO()} /></div></div>
      </div>

      {groups.map((g, i) => (
        <div key={`${g.title}-${i}`}>
          <p className="eyebrow">{g.title ?? "Details"}</p>
          <div className="group">
            {g.fields.map((f) => <FieldInput key={f.key} field={f} />)}
          </div>
        </div>
      ))}

      {error && <p className="error">{error}</p>}
      <button className="btn wide" disabled={pending}>{pending ? "Sending…" : `Send to ${form.name}`}</button>
    </form>
  );
}
