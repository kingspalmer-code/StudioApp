"use client";

import { useActionState } from "react";
import { inviteMember } from "@/app/actions";

export default function InviteButton({ email }: { email: string }) {
  const [state, action, pending] = useActionState(inviteMember.bind(null, email), null);
  if (state?.ok) return <span className="when" style={{ color: "var(--green)" }}>Invite sent</span>;
  return (
    <form action={action} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {state?.error && <span className="when" style={{ color: "var(--red)" }}>{state.error}</span>}
      <button className="link" type="submit" disabled={pending}>{pending ? "Sending…" : "Send invite"}</button>
    </form>
  );
}
