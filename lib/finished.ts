import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { formatDate } from "@/lib/priority";
import { firstTime, pushReady, sendAlert } from "@/lib/push";
import type { WorkspaceKind } from "@/lib/types";
import type { Terms } from "@/lib/workspace";
import { tellCustomers } from "@/lib/customers";

// A job reached the last stage, or was sent to the client for review: email the client or manager
// who sent it, and alert their phone if they've turned alerts on. Only jobs someone sent from their
// portal count, or ones the studio picked someone to keep updated on (tickets.tell), so other jobs
// the studio added itself (including imported past work) never email anyone. Each move is sent once.

type Studio = { name: string; replyTo: string; terms: Terms; kind?: WorkspaceKind };
type Job = { id: number; title: string; created_by: string; tell: string[]; delivered_at: string | null; updated_at: string; business_id: string };
type Person = { email: string; full_name: string; role: string; business_id: string | null };
export type Moment = "finished" | "review";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "oatcake.xyz";
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

export async function email(to: string, subject: string, lines: string[], link: string, label: string, from: string, replyTo: string, extra = "") {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const html = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#2a201c;max-width:520px">
${lines.map((l) => `<p style="margin:0 0 14px">${esc(l)}</p>`).join("\n")}
${extra}
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
// job, clients only their own businesses'. Keyed by email. Nobody, if the workspace has stopped
// taking requests from businesses (their logins are paused).
async function linkedPeople(supabase: SupabaseClient, emails: string[]) {
  const list = [...new Set(emails.filter(Boolean))];
  if (!list.length) return new Map<string, Person & { businesses: Set<string> }>();
  const [{ data: people }, { data: extra }] = await Promise.all([
    supabase.from("members").select("email, full_name, role, business_id, workspaces(kind)").in("email", list).returns<(Person & { workspaces: { kind: string } | null })[]>(),
    supabase.from("member_businesses").select("email, business_id").in("email", list).returns<{ email: string; business_id: string }[]>(),
  ]);
  return new Map(
    (people ?? [])
      .filter((p) => (p.role === "client" || p.role === "manager") && p.workspaces?.kind === "studio")
      .map((p) => [p.email, { ...p, businesses: new Set([p.business_id, ...(extra ?? []).filter((x) => x.email === p.email).map((x) => x.business_id)].filter((b) => b !== null)) }])
  );
}
// A client picked to keep updated on another business's job sees that job too.
const canSee = (p: Person & { businesses: Set<string> }, job: { business_id: string; tell: string[] }) => p.role === "manager" || p.businesses.has(job.business_id) || job.tell.includes(p.email);

export async function tellRequesters(supabase: SupabaseClient, ids: number[], studio: Studio, moment: Moment = "finished") {
  if (!ids.length) return;
  // Customers don't log in: they hear by email, with a link to their own page.
  if (studio.kind === "trade") return tellCustomers(supabase, ids, studio, moment);
  const { data: jobs } = await supabase
    .from("tickets")
    .select("id, title, created_by, tell, delivered_at, updated_at, business_id")
    .in("id", ids)
    .returns<Job[]>();
  const finished = (jobs ?? []).filter((j) => moment === "review" || j.delivered_at);
  if (!finished.length) return;
  const [people, { data: businesses }, { data: files }] = await Promise.all([
    linkedPeople(supabase, finished.flatMap((j) => [j.created_by, ...j.tell])),
    supabase.from("businesses").select("id, name").in("id", [...new Set(finished.map((j) => j.business_id))]).returns<{ id: string; name: string }[]>(),
    supabase.from("ticket_deliveries").select("ticket_id").in("ticket_id", finished.map((j) => j.id)).returns<{ ticket_id: number }[]>(),
  ]);
  const bizName = new Map((businesses ?? []).map((b) => [b.id, b.name]));
  const site = await origin();
  const { job } = studio.terms;

  for (const j of finished) {
    // Whoever sent it, plus anyone the studio picked to keep updated on it.
    const told = [...new Set([j.created_by, ...j.tell])].map((e) => people.get(e)).filter((p): p is NonNullable<typeof p> => p !== undefined && canSee(p, j));
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

// The studio just added a job and picked people to tell: email them and alert
// their phone. Sent once per job.
export async function tellPicked(supabase: SupabaseClient, id: number, studio: Studio) {
  const { data: j } = await supabase
    .from("tickets")
    .select("id, title, type, deadline, tell, business_id")
    .eq("id", id)
    .maybeSingle<{ id: number; title: string; type: string; deadline: string | null; tell: string[]; business_id: string }>();
  if (!j?.tell.length) return;
  const told = [...(await linkedPeople(supabase, j.tell)).values()].filter((p) => canSee(p, j));
  if (!told.length) return;
  if (pushReady() && !(await firstTime("new_job", String(j.id)))) return;
  const { data: biz } = await supabase.from("businesses").select("name").eq("id", j.business_id).maybeSingle<{ name: string }>();
  const { job } = studio.terms;
  const forBiz = biz?.name ? ` for ${biz.name}` : "";
  const due = j.deadline ? `, due ${formatDate(j.deadline)}` : "";
  const line = `${studio.name} has added a new ${job}${forBiz}: "${j.title}" (${j.type})${due}.`;
  const next = "You can follow it in Oatcake, and you'll hear when there's a draft to look at and when it's finished.";
  await Promise.all([
    ...told.map(async (who) => email(who.email, `New ${job}: ${j.title}`, [hello(who), line, next], `${await origin()}/tickets/${j.id}`, "Open in Oatcake", studio.name, studio.replyTo)),
    sendAlert(told.map((who) => who.email), { title: `New ${job}: ${j.title}`, body: `${studio.name} added it${forBiz}${due}.`, url: `/tickets/${j.id}`, tag: `ticket-${j.id}-new` }),
  ]);
}

// The studio picked more people to keep updated on a job that's already going: tell just them, with a
// link to it. Sent once per person per job.
export async function tellShared(supabase: SupabaseClient, id: number, emails: string[], studio: Studio) {
  if (!emails.length) return;
  const { data: j } = await supabase
    .from("tickets")
    .select("id, title, tell, business_id")
    .eq("id", id)
    .maybeSingle<{ id: number; title: string; tell: string[]; business_id: string }>();
  if (!j) return;
  const picked = [...(await linkedPeople(supabase, emails.filter((e) => j.tell.includes(e)))).values()].filter((p) => canSee(p, j));
  const told: typeof picked = [];
  for (const p of picked) if (!pushReady() || (await firstTime("shared", `${j.id}:${p.email}`))) told.push(p);
  if (!told.length) return;
  const { data: biz } = await supabase.from("businesses").select("name").eq("id", j.business_id).maybeSingle<{ name: string }>();
  const { job } = studio.terms;
  const forBiz = biz?.name ? ` for ${biz.name}` : "";
  const line = `${studio.name} has shared the ${job} "${j.title}"${forBiz} with you.`;
  const next = "You can see it in Oatcake and leave notes, and you'll hear when there's a draft to look at and when it's finished.";
  const link = `${await origin()}/tickets/${j.id}`;
  await Promise.all([
    ...told.map((who) => email(who.email, `Shared with you: ${j.title}`, [hello(who), line, next], link, "Open in Oatcake", studio.name, studio.replyTo)),
    sendAlert(told.map((who) => who.email), { title: `Shared with you: ${j.title}`, body: `${studio.name} shared it${forBiz}.`, url: `/tickets/${j.id}`, tag: `ticket-${j.id}-shared` }),
  ]);
}

// The studio shared a draft: email the person who asked for the job and anyone picked to keep
// updated, with the draft's message, its images and links, and alert their phones. Sent once per draft.
export async function tellDraft(supabase: SupabaseClient, ticketId: number, draftId: number, studio: Studio) {
  const [{ data: j }, { data: drafts }, { data: files }] = await Promise.all([
    supabase.from("tickets").select("id, title, created_by, tell, business_id").eq("id", ticketId).maybeSingle<Pick<Job, "id" | "title" | "created_by" | "tell" | "business_id">>(),
    supabase.from("ticket_drafts").select("id, message").eq("ticket_id", ticketId).order("created_at").returns<{ id: number; message: string }[]>(),
    supabase.from("ticket_draft_files").select("path, url, name, mime").eq("draft_id", draftId).order("created_at").returns<{ path: string | null; url: string | null; name: string; mime: string }[]>(),
  ]);
  const round = (drafts ?? []).findIndex((d) => d.id === draftId) + 1;
  if (!j || !round) return;
  const people = await linkedPeople(supabase, [j.created_by, ...j.tell]);
  const told = [...people.values()].filter((p) => canSee(p, j));
  if (!told.length) return;
  if (pushReady() && !(await firstTime("draft", String(draftId)))) return;

  // Images show in the email (their links last a week); links and other files are listed.
  const list = files ?? [];
  const images = list.filter((f) => f.path && f.mime.startsWith("image/")).slice(0, 3);
  const { data: signed } = images.length
    ? await supabase.storage.from("deliveries").createSignedUrls(images.map((f) => f.path!), 7 * 24 * 3600)
    : { data: [] };
  const pics = (signed ?? []).filter((x) => x.signedUrl).map((x) => `<img src="${x.signedUrl}" alt="" style="display:block;max-width:100%;border-radius:10px;margin:0 0 12px">`);
  const others = list.filter((f) => !images.includes(f)).map((f) => (f.url ? `<li><a href="${esc(f.url)}">${esc(f.name)}</a></li>` : `<li>${esc(f.name)}</li>`));
  const extra = pics.join("\n") + (others.length ? `<ul style="margin:0 0 14px;padding-left:18px">${others.join("")}</ul>` : "");

  const message = (drafts ?? [])[round - 1].message.trim();
  const { data: biz } = await supabase.from("businesses").select("name").eq("id", j.business_id).maybeSingle<{ name: string }>();
  const forBiz = biz?.name ? ` for ${biz.name}` : "";
  const line = `${studio.name} has shared draft ${round} of "${j.title}"${forBiz}. Have a look and leave any notes on it in Oatcake.`;
  const subject = `Draft ${round} to look at: ${j.title}`;
  const link = `${await origin()}/tickets/${j.id}`;
  await Promise.all([
    ...told.map((who) => email(who.email, subject, [hello(who), line, ...(message ? [`"${message}"`] : [])], link, "See the draft", studio.name, studio.replyTo, extra)),
    sendAlert(told.map((who) => who.email), { title: `Draft ${round} of ${j.title}`, body: message ? `${studio.name}: ${message.slice(0, 120)}` : `${studio.name} shared a draft for you to look at.`, url: `/tickets/${j.id}`, tag: `ticket-${j.id}-draft` }),
  ]);
}

// Who would be emailed about each of these jobs: whoever sent it and anyone picked to keep updated,
// if they can see it. Names, keyed by job, for the job's progress timeline.
export async function peopleToTell(supabase: SupabaseClient, ids: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (!ids.length) return out;
  const { data: jobs } = await supabase
    .from("tickets")
    .select("id, created_by, tell, business_id")
    .in("id", ids)
    .returns<Pick<Job, "id" | "created_by" | "tell" | "business_id">[]>();
  const people = await linkedPeople(supabase, (jobs ?? []).flatMap((j) => [j.created_by, ...j.tell]));
  for (const j of jobs ?? []) {
    const told = [...new Set([j.created_by, ...j.tell])].map((e) => people.get(e)).filter((p): p is NonNullable<typeof p> => p !== undefined && canSee(p, j));
    out.set(j.id, told.map((p) => p.full_name || p.email));
  }
  return out;
}

export type EventKind = "stage" | "review" | "finished" | "draft";

// Adds moves to the jobs' progress timelines, with who'll be told about each.
export async function logEvents(
  supabase: SupabaseClient,
  ids: number[],
  kind: EventKind,
  extra: { stage?: string; draft_id?: number; files?: string[]; actor?: string } = {}
) {
  if (!ids.length) return;
  const told = kind === "stage" ? new Map<number, string[]>() : await peopleToTell(supabase, ids);
  const { error } = await supabase.from("ticket_events").insert(
    ids.map((ticket_id) => ({ ticket_id, kind, stage: extra.stage ?? "", draft_id: extra.draft_id ?? null, files: extra.files ?? [], told: told.get(ticket_id) ?? [], actor: extra.actor ?? "" }))
  );
  if (error) console.error("ticket_events", error.message);
}
