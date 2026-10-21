"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { disconnectMail } from "@/app/documents/actions";

const RESULT: Record<string, { text: string; bad?: boolean }> = {
  connected: { text: "✓ Gmail connected. Quotes and invoices you send now come from it." },
  denied: { text: "Gmail wasn't connected, because Google was told no.", bad: true },
  scope: { text: "Google didn't allow sending. Try again and tick the box that lets Oatcake send email.", bad: true },
  off: { text: "Sending from Gmail isn't switched on for Oatcake yet.", bad: true },
  error: { text: "That didn't connect. Try again.", bad: true },
};

// Settings > Quotes & invoices > Sending: which address customers see quotes and invoices come from.
export default function MailConnect({ ready, email, sendAs, result, readOnly }: { ready: boolean; email: string | null; sendAs: string; result?: string; readOnly: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(result ? RESULT[result] ?? null : null);

  return (
    <fieldset disabled={readOnly || pending} className="doc-settings" style={{ marginTop: 28 }}>
      <p className="eyebrow">Sending</p>
      <div className="group">
        <div className="row">
          <span className="k">{email ? "From your Gmail" : "From Oatcake"}</span>
          <div className="ctl" style={{ textAlign: "right" }}>
            {email ? (
              <button type="button" className="link" onClick={() => start(async () => { try { await disconnectMail(); setMsg({ text: "Gmail disconnected. Emails go from Oatcake again." }); router.refresh(); } catch (e) { setMsg({ text: (e as Error).message, bad: true }); } })}>
                Disconnect
              </button>
            ) : ready ? (
              <a className="btn plain small" href="/api/mail/google/start" target="_top">Connect Gmail</a>
            ) : null}
          </div>
        </div>
        <div className="row">
          <span className="when">
            {email
              ? sendAs && sendAs !== email
                ? `Quotes and invoices go through ${email} from ${sendAs}, your Email above, and show in its Sent folder. ${sendAs} needs to be set up in Gmail under Settings > Accounts > Send mail as, or Gmail sends from ${email} instead.`
                : `Quotes and invoices go from ${email} and show in its Sent folder. To send from another address you've added to Gmail under "Send mail as", put it in Email above.`
              : ready
                ? "Customers see “via Oatcake” and replies come to your email above. Connect Gmail to send from your own address instead. Oatcake can only send, never read your mail."
                : "Customers see “via Oatcake” and replies come to your email above."}
          </span>
        </div>
      </div>
      {msg && <p className={msg.bad ? "error" : "foot"}>{msg.text}</p>}
    </fieldset>
  );
}
