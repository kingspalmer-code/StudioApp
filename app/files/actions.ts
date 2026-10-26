"use server";

import { requireEditor, requireMember } from "@/lib/session";
import { outbox } from "@/lib/outbox";
import { downloadUrl } from "@/lib/signed";

// The right-click menu on a job's files (components/FileMenu.tsx).

const BUCKETS = ["deliveries", "inspiration"] as const;
type Bucket = (typeof BUCKETS)[number];
// A link to share lasts a week, long enough for someone to get round to opening it.
const WEEK = 7 * 24 * 3600;
// Gmail takes 25MB a message once encoded, so bigger files go as a link instead.
const ATTACH_MAX_MB = 15;

const valid = (bucket: string, path: string): bucket is Bucket =>
  (BUCKETS as readonly string[]).includes(bucket) && typeof path === "string" && path.length > 0 && path.length < 600 && !path.includes("..");

// Storage only signs a file for someone allowed to read it, so this hands out nothing new.
async function weekLink(supabase: Awaited<ReturnType<typeof requireMember>>["supabase"], bucket: Bucket, path: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, WEEK);
  return data?.signedUrl ?? null;
}

export async function shareLink(bucket: string, path: string): Promise<{ url?: string; error?: string }> {
  if (!valid(bucket, path)) return { error: "That file can't be shared." };
  const { supabase } = await requireMember();
  const url = await weekLink(supabase, bucket, path);
  return url ? { url } : { error: "Couldn't make a link to that file. Try again." };
}

// A link that saves the file under its own name, for files the page didn't sign one for up front.
export async function saveLink(bucket: string, path: string, name: string): Promise<string | null> {
  if (!valid(bucket, path)) return null;
  const { supabase } = await requireMember();
  return downloadUrl(supabase, bucket, path, String(name || "file").slice(0, 200));
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// The studio emails a file from the job: attached when it's small enough, otherwise as a link that
// lasts a week. A file kept elsewhere (a delivery added as a link) goes as that link.
export async function emailFile(f: {
  bucket?: string;
  path?: string | null;
  url?: string | null;
  name: string;
  ticketId: number;
  to: string;
  message: string;
}): Promise<{ ok?: boolean; error?: string; note?: string; via?: string }> {
  const { supabase, workspace, member } = await requireEditor(["designer"], "requests");
  const mail = await outbox(supabase, workspace, member.email);
  if (!mail.ready) return { error: "Emailing isn't switched on yet. Copy the link and send it yourself for now." };
  const address = f.to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { error: "Check the email address." };
  const name = String(f.name || "File").slice(0, 200);

  let link: string | null = null;
  let attachment: { filename: string; content: Buffer; type: string } | undefined;
  if (f.path) {
    if (!f.bucket || !valid(f.bucket, f.path)) return { error: "That file can't be sent." };
    const { data: blob } = await supabase.storage.from(f.bucket).download(f.path);
    if (!blob) return { error: "Couldn't open that file. Try again." };
    if (blob.size <= ATTACH_MAX_MB * 1024 * 1024) attachment = { filename: name, content: Buffer.from(await blob.arrayBuffer()), type: blob.type };
    else link = await weekLink(supabase, f.bucket, f.path);
    if (!attachment && !link) return { error: "Couldn't make a link to that file. Try again." };
  } else if (f.url && /^https?:\/\/\S+$/.test(f.url)) {
    link = f.url;
  } else return { error: "That file can't be sent." };

  const { data: job } = await supabase.from("tickets").select("title").eq("id", f.ticketId).maybeSingle<{ title: string }>();
  const { from, replyTo } = mail;
  const body = f.message.trim() || (attachment ? `Here's ${name}, attached.` : `Here's ${name}.`);
  const html = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#2a201c;max-width:520px">
${esc(body).replace(/\n/g, "<br>")}
${link ? `<p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:${mail.settings.accent};color:#fff;text-decoration:none;font-weight:600">Open ${esc(name)}</a></p>` : ""}
<p style="margin:22px 0 4px;color:#6b5d55;font-size:13px">${esc(name)}${job?.title ? ` · ${esc(job.title)}` : ""}${link && f.path ? " · The link works for 7 days" : ""}</p>
<p style="margin:0;color:#6b5d55;font-size:13px">${esc(from)}${replyTo ? ` · Reply to this email to get in touch` : ""}</p>
</div>`;
  const text = `${body}\n\n${link ? `${link}\n${f.path ? "(The link works for 7 days.)\n" : ""}\n` : ""}${name}${job?.title ? ` · ${job.title}` : ""}\n\n${from}`;

  const sent = await mail.send({ to: address, subject: `${name} from ${from}`, text, html, attachment });
  if (!sent.ok) return { error: sent.error };
  return { ok: true, via: sent.via, note: sent.note };
}
