import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { formatDate } from "@/lib/priority";
import { firstTime, pushReady, sendAlert } from "@/lib/push";
import type { Terms } from "@/lib/workspace";

// A job reached the last stage, or was sent to the client for review: email the client or manager
// who sent it, and alert their phone if they've turned alerts on. Only jobs someone sent from their
// portal count, or ones the studio picked someone to keep updated on (tickets.notify), so other jobs
// the studio added itself (including imported past work) never email anyone. Each move is sent once.

type Studio = { name: string; replyTo: string; terms: Terms };
type Job = { id: number; title: string; created_by: string; notify: string | null; delivered_at: string | null; updated_at: string; business_id: string };
type Person = { email: string; full_name: string; role: string; business_id: string | null };
export type Moment = "finished" | "review";

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

// The jobs among ids that aren't at this stage yet, so callers only tell people about real moves.
export async function notYetFinished(supabase: SupabaseClient, ids: number[], stage: string): Promise<number[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from("tickets").select("id, status").in("id", ids).returns<{ id: number; status: string }[]>();
  return (data ?? []).filter((t) => t.status !== stage).map((t) => t.id);
}

// The clients and managers among these emails who can see jobs for the business: managers see every
// job, clients only their own businesses'. Keyed by email.
async function linkedPeople(supabase: SupabaseClient, emails: string[]) {
  const list = [...new Set(emails.filter(Boolean))];
  if (!list.length) return new Map<string, Person & { businesses: Set<string> }>();
  const [{ data: people }, { data: extra }] = await Promise.all([
    supabase.from("members").select("email, full_name, role, business_id").in("email", list).returns<Person[]>(),
    supabase.from("member_businesses").select("email, business_id").in("email", list).returns<{ email: string; business_id: string }[]>(),
  ]);
  return new Map(
    (people ?? [])
      .filter((p) => p.role === "client" || p.role === "manager")
      .map((p) => [p.email, { ...p, businesses: new Set([p.business_id, ...(extra ?? []).filter((x) => x.email === p.email).map((x) => x.business_id)].filter((b) => b !== null)) }])
  );
}
const canSee = (p: Person & { businesses: Set<string> }, businessId: string) => p.role === "manager" || p.businesses.has(businessId);

export async function tellRequesters(supabase: SupabaseClient, ids: number[], studio: Studio, moment: Moment = "finished") {
  if (!ids.length) return;
  const { data: jobs } = await supabase
    .from("tickets")
    .select("id, title, created_by, notify, delivered_at, updated_at, business_id")
    .in("id", ids)
    .returns<Job[]>();
  const finished = (jobs ?? []).filter((j) => moment === "review" || j.delivered_at);
  if (!finished.length) return;
  const [people, { data: businesses }, { data: files }] = await Promise.all([
    linkedPeople(supabase, finished.flatMap((j) => [j.created_by, j.notify ?? ""])),
    supabase.from("businesses").select("id, name").in("id", [...new Set(finished.map((j) => j.business_id))]).returns<{ id: string; name: string }[]>(),
    supabase.from("ticket_deliveries").select("ticket_id").in("ticket_id", finished.map((j) => j.id)).returns<{ ticket_id: number }[]>(),
  ]);
  const bizName = new Map((businesses ?? []).map((b) => [b.id, b.name]));
  const site = await origin();
  const { job } = studio.terms;

  for (const j of finished) {
    // Whoever sent it, plus anyone the studio picked to keep updated on it.
    const told = [...new Set([j.created_by, j.notify ?? ""])].map((e) => people.get(e)).filter((p): p is NonNullable<typeof p> => p !== undefined && canSee(p, j.business_id));
    if (!told.length) continue;
    // Sent once per move; finishing it again after reopening it tells them again.
    if (pushReady() && !(await firstTime(moment, `${j.id}:${moment === "finished" ? j.delivered_at : j.updated_at}`))) continue;
    const count = (files ?? []).filter((f) => f.ticket_id === j.id).length;
    const link = `${site}/tickets/${j.id}`;
    const biz = bizName.get(j.business_id);
    const forBiz = biz ? ` for ${biz}` : "";
    const msg =
      moment === "finished"
        ? {
            subject: `Finished: ${j.title}`,
            line: `${studio.name} has finished your ${job} "${j.title}"${forBiz}.`,
            next: count ? `The finished ${count === 1 ? "file is" : `${count} files are`} ready to download.` : "Have a look whenever you're ready.",
            title: `${j.title} is finished`,
          }
        : {
            subject: `Ready for your review: ${j.title}`,
            line: `${studio.name} has sent your ${job} "${j.title}"${forBiz} over for you to look at.`,
            next: "Have a look and leave any notes on it in Oatcake.",
            title: `${j.title} is ready for your review`,
          };
    await Promise.all([
      ...told.map((who) => email(who.email, msg.subject, [hello(who), `${msg.line} ${msg.next}`], link, "Open in Oatcake", studio.name, studio.replyTo)),
      sendAlert(told.map((who) => who.email), { title: msg.title, body: `${studio.name}: ${msg.next}`, url: `/tickets/${j.id}`, tag: `ticket-${j.id}-${moment}` }),
    ]);
  }
}

const hello = (who: Person) => (who.full_name ? `Hi ${who.full_name.split(" ")[0]},` : "Hi,");

// The studio just added a job and picked someone at the business to tell: email them and alert
// their phone. Sent once per job.
export async function tellPicked(supabase: SupabaseClient, id: number, studio: Studio) {
  const { data: j } = await supabase
    .from("tickets")
    .select("id, title, type, deadline, notify, business_id")
    .eq("id", id)
    .maybeSingle<{ id: number; title: string; type: string; deadline: string; notify: string | null; business_id: string }>();
  if (!j?.notify) return;
  const who = (await linkedPeople(supabase, [j.notify])).get(j.notify);
  if (!who || !canSee(who, j.business_id)) return;
  if (pushReady() && !(await firstTime("new_job", String(j.id)))) return;
  const { data: biz } = await supabase.from("businesses").select("name").eq("id", j.business_id).maybeSingle<{ name: string }>();
  const { job } = studio.terms;
  const forBiz = biz?.name ? ` for ${biz.name}` : "";
  const due = formatDate(j.deadline);
  const line = `${studio.name} has added a new ${job}${forBiz}: "${j.title}" (${j.type}), due ${due}.`;
  const next = "You can follow it in Oatcake, and you'll hear when it's ready for your review or finished.";
  await Promise.all([
    email(who.email, `New ${job}: ${j.title}`, [hello(who), line, next], `${await origin()}/tickets/${j.id}`, "Open in Oatcake", studio.name, studio.replyTo),
    sendAlert([who.email], { title: `New ${job}: ${j.title}`, body: `${studio.name} added it${forBiz}, due ${due}.`, url: `/tickets/${j.id}`, tag: `ticket-${j.id}-new` }),
  ]);
}
