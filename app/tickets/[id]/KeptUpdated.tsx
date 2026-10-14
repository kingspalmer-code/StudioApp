"use client";

import { useState, useTransition } from "react";
import TellPicker, { type TellPerson } from "@/components/TellPicker";
import { setTell } from "./actions";

// The studio picking who else hears about this job: new drafts, review and finished.
export default function KeptUpdated({ ticketId, value, people, sender }: { ticketId: number; value: string[]; people: TellPerson[]; sender: string | null }) {
  const [picked, setPicked] = useState(value);
  const [pending, start] = useTransition();
  return (
    <>
      {sender && <p className="tell-auto">{sender} sent this, so they&apos;re told automatically.</p>}
      <TellPicker
        people={people}
        value={picked}
        disabled={pending}
        onChange={(next) => {
          setPicked(next);
          start(() => setTell(ticketId, next));
        }}
      />
    </>
  );
}
