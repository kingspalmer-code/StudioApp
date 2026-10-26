import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSettings } from "./docs-server";
import { gmailReady, sendViaGmail, type Mail } from "./gmail";

// Email sent on a business's behalf (quotes, invoices, job files). It goes from their own Gmail when
// one is connected, otherwise from Oatcake's address with replies going to them. If Gmail stops
// accepting the sign-in, it goes from Oatcake and says to reconnect.
export type Outgoing = Pick<Mail, "to" | "subject" | "text" | "html" | "attachment">;
export type Sent = { ok: true; via?: string; note?: string } | { ok: false; error: string };

export async function outbox(supabase: SupabaseClient, workspace: { id: string; name: string }, loginEmail: string) {
  const key = process.env.RESEND_API_KEY;
  const [{ data: account }, settings] = await Promise.all([
    gmailReady()
      ? supabase.from("mail_accounts").select("email, refresh_token").eq("workspace_id", workspace.id).maybeSingle<{ email: string; refresh_token: string }>()
      : Promise.resolve({ data: null }),
    loadSettings(supabase, workspace.id),
  ]);
  const from = (settings.business_name || workspace.name).replace(/[<>"]/g, "");
  const replyTo = settings.email || loginEmail;

  async function send(m: Outgoing): Promise<Sent> {
    let note: string | undefined;
    if (account) {
      // The Email in Settings can be one of their Gmail "Send mail as" addresses (say a work alias).
      // Gmail sends from it if it's set up there, and quietly uses the main address if it isn't.
      const sendAs = settings.email && settings.email !== account.email ? settings.email : account.email;
      const sent = await sendViaGmail(account.refresh_token, { ...m, fromName: from, from: sendAs, replyTo: replyTo || undefined });
      if (sent.ok) return { ok: true, via: sendAs };
      console.error("outbox gmail", sent.detail);
      if (!key) return { ok: false, error: sent.reconnect ? "Gmail needs reconnecting in Settings > Quotes & invoices. Nothing was sent." : "Gmail didn't send it. Try again in a moment." };
      note = sent.reconnect ? "Gmail needs reconnecting in Settings > Quotes & invoices, so this went from Oatcake's address." : "Gmail didn't take it, so this went from Oatcake's address.";
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${from} via Oatcake <documents@oatcake.xyz>`,
        to: [m.to],
        reply_to: replyTo || undefined,
        subject: m.subject,
        html: m.html,
        text: m.text,
        ...(m.attachment ? { attachments: [{ filename: m.attachment.filename, content: m.attachment.content.toString("base64") }] } : {}),
      }),
    });
    if (!res.ok) {
      console.error("outbox resend", res.status, await res.text());
      return { ok: false, error: `The email didn't send (${res.status}). Try again in a moment.` };
    }
    return { ok: true, note };
  }

  return { ready: Boolean(key || account), from, replyTo, settings, send };
}
