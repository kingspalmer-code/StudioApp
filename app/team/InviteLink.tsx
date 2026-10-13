"use client";

import { useState } from "react";
import { reinviteEmployee } from "@/app/tasks/actions";

// A link to send an employee by text or WhatsApp. It opens sign-in with their email filled in.
export default function InviteLink({ url, email }: { url: string; email?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const share = async () => {
    const text = "Here's your to-do list on Oatcake. Open this link and tap Email me a link to sign in:";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Your to-do list", text, url });
        return;
      } catch {
        // Cancelled or not allowed: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMsg("Link copied");
    } catch {
      setMsg(url);
    }
  };
  const resend = async () => {
    if (!email) return;
    setBusy(true);
    const r = await reinviteEmployee(email);
    setBusy(false);
    setMsg(r.error ?? r.ok ?? null);
  };
  return (
    <span className="invite-link">
      <button type="button" className="link" onClick={share}>Share invite link</button>
      {email && <button type="button" className="link" onClick={resend} disabled={busy}>{busy ? "Sending…" : "Email invite"}</button>}
      {msg && <span className="when">{msg}</span>}
    </span>
  );
}
