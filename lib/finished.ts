import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { firstTime, pushReady, sendAlert } from "@/lib/push";
import type { Terms } from "@/lib/workspace";

// A job reached the last stage: email the client or manager who sent it, and alert their phone if
// they've turned alerts on. Only jobs someone sent from their portal count, so jobs the studio
// added itself (including imported past work) never email anyone. Each finish is sent once.

type Studio = { name: string; replyTo: string; terms: Terms };
type Job = { id: number; title: string; created_by: string; delivered_at: string | null; business_id: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "oatcake.xyz";
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

async function email(to: string, subject: string, lines: string[], link: string, label: string, from: string, replyTo: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const html = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#2a201c;max-width:520px">
${lines.map((l) => `<p style="margin:0 0 14px">${esc(l)}</p>`).join("\n")}
<a href="${link}" style="display:inline-block;margin-top:8px;background:#382A25;color:#f3e9dc;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px">${esc(label)}</a>
</div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${from.replace(/[<>"]/g, "")} via Oatcake <updates@oatcake.xyz>`,
        to: [to],
        reply_to: replyTo || undefined,
        subject,
        html,
        text: `${lines.join("\n\n")}\n\n${label}: ${link}`,
      }),
    });
    if (!res.ok) console.error("finished email", res.status, await res.text());
  } catch (e) {
    console.error("finished email", e);
  }
}

// The jobs among ids that aren't at the last stage yet, so callers only tell people about real finishes.
export async function notYetFinished(supabase: SupabaseClient, ids: number[], final: string): Promise<number[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from("tickets").select("id, status").in("id", ids).returns<{ id: number; status: string }[]>();
  return (data ?? []).filter((t) => t.status !== final).map((t) => t.id);
}

export async function tellRequesters(supabase: SupabaseClient, ids: number[], studio: Studio) {
  if (!ids.length) return;
  const { data: jobs } = await supabase
    .from("tickets")
    .select("id, title, created_by, delivered_at, business_id")
    .in("id", ids)
    .returns<Job[]>();
  const finished = (jobs ?? []).filter((j) => j.delivered_at);
  if (!finished.length) return;
  const [{ data: people }, { data: businesses }, { data: files }] = await Promise.all([
    supabase
      .from("members")
      .select("email, full_name, role")
      .in("email", [...new Set(finished.map((j) => j.created_by))])
      .returns<{ email: string; full_name: string; role: string }[]>(),
    supabase.from("businesses").select("id, name").in("id", [...new Set(finished.map((j) => j.business_id))]).returns<{ id: string; name: string }[]>(),
    supabase.from("ticket_deliveries").select("ticket_id").in("ticket_id", finished.map((j) => j.id)).returns<{ ticket_id: number }[]>(),
  ]);
  const requester = new Map((people ?? []).filter((p) => p.role === "client" || p.role === "manager").map((p) => [p.email, p]));
  const bizName = new Map((businesses ?? []).map((b) => [b.id, b.name]));
  const site = await origin();
  const { job } = studio.terms;

  for (const j of finished) {
    const who = requester.get(j.created_by);
    if (!who) continue;
    // Sent once per finish; finishing it again after reopening it tells them again.
    if (pushReady() && !(await firstTime("finished", `${j.id}:${j.delivered_at}`))) continue;
    const count = (files ?? []).filter((f) => f.ticket_id === j.id).length;
    const ready = count ? `The finished ${count === 1 ? "file is" : `${count} files are`} ready to download.` : "Have a look whenever you're ready.";
    const link = `${site}/tickets/${j.id}`;
    const biz = bizName.get(j.business_id);
    const hello = who.full_name ? `Hi ${who.full_name.split(" ")[0]},` : "Hi,";
    await Promise.all([
      email(
        who.email,
        `Finished: ${j.title}`,
        [hello, `${studio.name} has finished your ${job} "${j.title}"${biz ? ` for ${biz}` : ""}. ${ready}`],
        link,
        `Open in Oatcake`,
        studio.name,
        studio.replyTo
      ),
      sendAlert([who.email], { title: `${j.title} is finished`, body: `${studio.name}: ${ready}`, url: `/tickets/${j.id}`, tag: `ticket-${j.id}-finished` }),
    ]);
  }
}
