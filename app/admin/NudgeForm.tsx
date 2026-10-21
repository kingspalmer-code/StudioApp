"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { flashSaved } from "@/components/Saved";
import Submit from "@/components/Submit";

type State = { error?: string; ok?: string } | null;

const BOOKING_KEY = "oc_nudge_booking";

// Write to someone who hasn't got going, offering a call. The message starts written for them and can
// be changed before it goes. A booking link (Calendly etc.) is optional and remembered on this computer.
export default function NudgeForm({
  action,
  name,
  subject,
  body,
  lastNudged,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  name: string;
  subject: string;
  body: string;
  lastNudged: string | null;
}) {
  const [state, formAction] = useActionState(action, null);
  const [booking, setBooking] = useState("");
  const box = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    try { setBooking(localStorage.getItem(BOOKING_KEY) ?? ""); } catch {}
  }, []);

  useEffect(() => {
    if (!state?.ok) return;
    flashSaved(state.ok);
    if (box.current) box.current.open = false;
  }, [state]);

  return (
    <details className="nudge" ref={box}>
      <summary className="btn small">{lastNudged ? "Nudge again" : `Nudge ${name}`}</summary>
      <form action={formAction}>
        {lastNudged && <p className="foot">You last nudged them {lastNudged}.</p>}
        <div className="group">
          <div className="row"><label htmlFor="n-subject">Subject</label><div className="ctl"><input id="n-subject" name="subject" defaultValue={subject} required maxLength={140} /></div></div>
          <div className="row stack"><label htmlFor="n-body">Message</label><textarea id="n-body" name="body" defaultValue={body} rows={9} required maxLength={6000} /></div>
          <div className="row">
            <label htmlFor="n-booking">Booking link</label>
            <div className="ctl">
              <input
                id="n-booking"
                name="booking"
                type="url"
                value={booking}
                onChange={(e) => {
                  setBooking(e.target.value);
                  try { localStorage.setItem(BOOKING_KEY, e.target.value); } catch {}
                }}
                placeholder="Optional, e.g. a Calendly link"
              />
            </div>
          </div>
        </div>
        <p className="foot">
          Emailed from you, and replies come to your inbox. It also shows in their Help in Oatcake, so a reply there lands in Support.
          {booking ? " The email's button opens your booking link." : ""}
        </p>
        {state?.error && <p className="error">{state.error}</p>}
        <Submit className="btn wide">Send nudge</Submit>
      </form>
    </details>
  );
}
