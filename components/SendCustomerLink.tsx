"use client";

import { useState, useTransition } from "react";
import { emailCustomerLink } from "@/app/settings/actions";

// Emails a customer the link to their own page, where they follow all their jobs and reply.
export default function SendCustomerLink({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="row">
      <div className="ctl when">{msg ?? `${name.split(/\s+/)[0]} can follow their jobs and reply on their own page.`}</div>
      <button
        type="button"
        className="link"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await emailCustomerLink(id);
            setMsg(res.error ?? `Sent to ${res.sent}.`);
          })
        }
      >
        {pending ? "Sending…" : "Email their link"}
      </button>
    </div>
  );
}
