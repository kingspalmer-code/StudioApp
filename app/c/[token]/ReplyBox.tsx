"use client";

import { useRef, useState, useTransition } from "react";
import { customerReply } from "./actions";

export default function ReplyBox({ token, job, to }: { token: string; job: number; to: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      className="cust-reply"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          setError(null);
          const res = await customerReply(token, job, data);
          if (res.error) setError(res.error);
          else form.current?.reset();
        });
      }}
    >
      <div className="group">
        <div className="row stack">
          <label htmlFor={`reply-${job}`}>Reply to {to}</label>
          <textarea id={`reply-${job}`} name="message" rows={2} maxLength={4000} required />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn small" disabled={pending}>{pending ? "Sending…" : "Send"}</button>
    </form>
  );
}
