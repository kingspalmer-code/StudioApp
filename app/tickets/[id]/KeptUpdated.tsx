"use client";

import { useTransition } from "react";
import { setNotify } from "./actions";

// The studio picking who at the business hears about this job: new drafts, review and finished.
export default function KeptUpdated({ ticketId, value, people }: { ticketId: number; value: string; people: { email: string; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <select aria-label="Keep updated" value={value} disabled={pending} onChange={(e) => start(() => setNotify(ticketId, e.target.value))}>
      <option value="">Nobody else</option>
      {people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
    </select>
  );
}
