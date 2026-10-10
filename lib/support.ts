import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

// Help & support: shared bits for the person asking (/help) and Oatcake answering (/admin/support).
export type SupportTicket = {
  id: number;
  user_id: string;
  email: string;
  name: string;
  workspace_id: string | null;
  subject: string;
  status: "open" | "waiting" | "solved";
  page: string;
  device: string;
  last_from: "user" | "oatcake";
  user_seen_at: string;
  admin_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportMessage = {
  id: number;
  ticket_id: number;
  from_oatcake: boolean;
  author_name: string;
  body: string;
  attachment: string | null;
  created_at: string;
};

// Where new help requests are emailed. Set SUPPORT_INBOX in Vercel to change it.
const INBOX = process.env.SUPPORT_INBOX || "kingspalmer@gmail.com";

export const STATUS_TEXT = { open: "Open", waiting: "Waiting on them", solved: "Solved" } as const;

// Conversations are titled by the start of their first message, cut at a word.
export function ticketTitle(t: Pick<SupportTicket, "subject">, first?: string) {
  if (t.subject) return t.subject;
  const line = (first ?? "").split("\n")[0].trim();
  if (line.length <= 60) return line || "Help request";
  return `${line.slice(0, 60).replace(/\s+\S*$/, "")}…`;
}

// A short, readable description of the device from the browser's user agent.
export async function deviceLabel() {
  const ua = (await headers()).get("user-agent") ?? "";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Other";
  const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${os} · ${browser}`;
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "oatcake.xyz";
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function send(to: string, subject: string, intro: string, body: string, link: string, label: string, replyTo?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const html = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#2a201c;max-width:520px">
<p style="margin:0 0 14px;color:#6b5d55;font-size:13px">${esc(intro)}</p>
<div style="border-left:3px solid #e4d8cb;padding:2px 0 2px 14px;margin:0 0 22px">${esc(body).replace(/\n/g, "<br>")}</div>
<a href="${link}" style="display:inline-block;background:#382A25;color:#f3e9dc;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px">${esc(label)}</a>
</div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Oatcake Support <support@oatcake.xyz>",
        to: [to],
        reply_to: replyTo,
        subject,
        html,
        text: `${intro}\n\n${body}\n\n${label}: ${link}`,
      }),
    });
    if (!res.ok) console.error("support email", res.status, await res.text());
  } catch (e) {
    console.error("support email", e);
  }
}

// Someone asked for help, or replied: let Oatcake know.
export async function notifyInbox(t: { id: number; name: string; email: string; subject: string }, body: string, isNew: boolean) {
  const who = t.name || t.email;
  await send(
    INBOX,
    `${isNew ? "Help request" : "New reply"} from ${who}: ${ticketTitle(t, body)}`,
    `${who} (${t.email}) ${isNew ? "asked for help" : "replied"}.`,
    body,
    `${await origin()}/admin/support/${t.id}`,
    "Open in Oatcake"
  );
}

// Oatcake answered: let the person know, with a link back to the conversation.
export async function notifyPerson(t: { id: number; email: string }, body: string) {
  await send(t.email, "Oatcake replied to your message", "Oatcake replied to your message:", body, `${await origin()}/help/${t.id}`, "View and reply", INBOX);
}

// Signed links for attached screenshots (the bucket is private).
export async function attachmentUrls(supabase: SupabaseClient, messages: SupportMessage[]) {
  const paths = messages.map((m) => m.attachment).filter((p): p is string => Boolean(p));
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from("support").createSignedUrls(paths, 3600);
  const urls: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
  return urls;
}
