"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireEditor } from "@/lib/session";
import { createClient, PREVIEW_COOKIE } from "@/lib/supabase/server";
import { appliesTo, readFields, type JobField } from "@/lib/fields";
import { emailInvite } from "@/lib/invite";
import { alertNewNote } from "@/app/portal/actions";
import { logEvents, notYetFinished, tellRequesters } from "@/lib/finished";
import { finalStage, PRIORITIES, reviewStage } from "@/lib/priority";
import { isSelf, slugify } from "@/lib/workspace";
import type { Role, Status } from "@/lib/types";

export async function signOut() {
  const supabase = await createClient();
  // Only this browser or app. Supabase's default signs you out everywhere, so signing out on one
  // device (say, to try a client's login) logged you out of the Mac app, Safari and your phone too.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

export async function setStatus(id: number, status: Status) {
  const { supabase, ctx, member, workspace, terms } = await requireEditor(["designer"]);
  if (!ctx.stages.some((s) => s.key === status)) return;
  // Finishing a job, or sending it to the client to look over, tells the person who asked for it.
  const moment = status === finalStage(ctx) ? "finished" : status === reviewStage(ctx)?.key ? "review" : null;
  const moving = await notYetFinished(supabase, [id], status);
  await supabase.from("tickets").update({ status }).eq("id", id);
  if (moving.length) {
    // Onto the job's progress timeline, with the files that go with it: the latest draft for a
    // review, the finished files when it's done.
    const { data: latest } = moment === "review"
      ? await supabase.from("ticket_drafts").select("id").eq("ticket_id", id).is("final_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: number }>()
      : { data: null };
    const { data: files } = moment === "review" && latest
      ? await supabase.from("ticket_draft_files").select("name").eq("draft_id", latest.id).order("created_at").returns<{ name: string }[]>()
      : moment === "finished"
        ? await supabase.from("ticket_deliveries").select("name").eq("ticket_id", id).order("created_at").returns<{ name: string }[]>()
        : { data: [] };
    await logEvents(supabase, moving, moment ?? "stage", { stage: status, draft_id: latest?.id, files: (files ?? []).map((f) => f.name), actor: member.full_name || member.email });
  }
  if (moment && moving.length) after(() => tellRequesters(supabase, moving, { name: workspace.name, replyTo: member.email, terms, kind: workspace.kind }, moment).catch(() => {}));
  revalidatePath("/", "layout");
}

export async function setPinned(id: number, pinned: boolean) {
  const { supabase } = await requireEditor(["designer"]);
  await supabase.from("tickets").update({ pinned }).eq("id", id);
  revalidatePath("/", "layout");
}

// Saves the job's details from the job page: the top-of-form fields (title, type, needed by,
// importance, and the customer and their phone for Customers workspaces) and the job's form fields.
// Fields not on the page are left as they are.
export async function saveDetails(id: number, formData: FormData) {
  const { supabase, ctx, workspace } = await requireEditor(["designer"]);
  const [{ data: t }, { data: fields }, { data: customers }] = await Promise.all([
    supabase.from("tickets").select("type, details, business_id").eq("id", id).maybeSingle<{ type: string; details: Record<string, unknown>; business_id: string }>(),
    supabase.from("job_fields").select("*").returns<JobField[]>(),
    workspace.kind === "trade" && formData.has("customer")
      ? supabase.from("businesses").select("id, name, slug, phone").returns<{ id: string; name: string; slug: string; phone: string | null }[]>()
      : { data: null },
  ]);
  if (!t) return;
  const typeId = ctx.types.find((x) => x.name === t.type)?.id;
  const editable = (fields ?? []).filter((f) => !f.hidden && appliesTo(f, typeId));
  const { columns, details } = readFields(
    editable,
    (k) => String(formData.get(k) ?? "").trim(),
    (k) => formData.get(k) != null,
    t.details ?? {}
  );
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const core: Record<string, string> = {};
  if (get("title")) core.title = get("title");
  if (ctx.types.some((x) => x.name === get("type"))) core.type = get("type");
  if (/^\d{4}-\d{2}-\d{2}$/.test(get("deadline"))) core.deadline = get("deadline");
  if ((PRIORITIES as string[]).includes(get("priority"))) core.priority = get("priority");

  // The customer works as on the new job form: an existing name moves the job to them, a new name
  // becomes a new customer. The phone saves onto whichever customer the job ends up with.
  let business_id = t.business_id;
  const name = get("customer");
  const phone = get("phone");
  if (customers && name) {
    const current = customers.find((b) => b.id === t.business_id);
    const match = customers.find((b) => !isSelf(b) && b.name.toLowerCase() === name.toLowerCase());
    if (match) {
      business_id = match.id;
      if (formData.has("phone") && phone !== (match.phone ?? "")) await supabase.from("businesses").update({ phone: phone || null }).eq("id", match.id);
    } else if (name.toLowerCase() !== current?.name.toLowerCase()) {
      const { data: created } = await supabase
        .from("businesses")
        .insert({ name, slug: slugify(name), color: "#8a7a70", phone: phone || null })
        .select("id")
        .single<{ id: string }>();
      if (created) business_id = created.id;
    }
  }

  await supabase.from("tickets").update({ ...columns, details, ...core, business_id }).eq("id", id);
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/queue");
}

export async function deleteTicket(id: number) {
  const { supabase } = await requireEditor(["designer"]);
  const { data: files } = await supabase.from("ticket_files").select("path").eq("ticket_id", id);
  if (files?.length) await supabase.storage.from("inspiration").remove(files.map((f) => f.path));
  await supabase.from("tickets").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/queue");
}

// Marks several jobs as at the last stage in one go, from the queue's Select mode.
export async function deliverTickets(ids: number[]) {
  const { supabase, ctx, member, workspace, terms } = await requireEditor(["designer"]);
  const final = ctx.stages[ctx.stages.length - 1]?.key;
  if (!final || !ids.length) return;
  const finishing = await notYetFinished(supabase, ids, final);
  await supabase.from("tickets").update({ status: final }).in("id", ids);
  await logEvents(supabase, finishing, "finished", { stage: final, actor: member.full_name || member.email });
  if (finishing.length) after(() => tellRequesters(supabase, finishing, { name: workspace.name, replyTo: member.email, terms, kind: workspace.kind }).catch(() => {}));
  revalidatePath("/", "layout");
}

export async function deleteTickets(ids: number[]) {
  const { supabase } = await requireEditor(["designer"]);
  if (!ids.length) return;
  const { data: files } = await supabase.from("ticket_files").select("path").in("ticket_id", ids);
  if (files?.length) await supabase.storage.from("inspiration").remove(files.map((f) => f.path));
  await supabase.from("tickets").delete().in("id", ids);
  revalidatePath("/", "layout");
}

// A note on a job, or on one of its drafts (the form's "draft" field). Clients, and managers on the
// requests they sent, can keep adding notes after sending; the studio gets a phone alert for those.
export async function addNote(id: number, formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  const draft_id = Number(formData.get("draft")) || null;
  const { supabase, member } = await requireEditor(["designer", "client", "manager"]);
  const { data } = await supabase
    .from("ticket_notes")
    .insert({ ticket_id: id, body, author_name: member.full_name || member.email, draft_id })
    .select("id")
    .maybeSingle<{ id: number }>();
  if (data && member.role !== "designer") after(() => alertNewNote(data.id).catch(() => {}));
  revalidatePath(`/tickets/${id}`);
}

// The client (or a manager on a job they're part of) approves a draft: a note saying so, which the
// studio hears about in their notifications and on their phones. Once per draft.
export async function approveDraft(ticketId: number, draftId: number) {
  const { supabase, member } = await requireEditor(["client", "manager"]);
  const { data: done } = await supabase.from("ticket_notes").select("id").eq("draft_id", draftId).eq("kind", "approval").limit(1);
  if (done?.length) return;
  const { data } = await supabase
    .from("ticket_notes")
    .insert({ ticket_id: ticketId, draft_id: draftId, kind: "approval", body: "Approved this draft.", author_name: member.full_name || member.email })
    .select("id")
    .maybeSingle<{ id: number }>();
  if (data) after(() => alertNewNote(data.id).catch(() => {}));
  revalidatePath(`/tickets/${ticketId}`);
}

export type AddState = { error?: string; ok?: string } | null;

export async function addMember(_prev: AddState, formData: FormData): Promise<AddState> {
  const { supabase, member, workspace } = await requireEditor(["designer"]);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const business_id = role === "client" ? String(formData.get("business_id") ?? "") || null : null;
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  if (!["designer", "manager", "client"].includes(role)) return { error: "Choose a role." };
  if (role === "client" && !business_id) return { error: "Choose which business they work for." };
  const { error } = await supabase.from("members").upsert({ email, full_name, role, business_id });
  if (error) return { error: `Couldn't save: ${error.message}` };
  if (role === "client" || role === "manager") {
    const also = formData.getAll("also").map(String).filter((id) => id && id !== business_id);
    const saved = await saveOtherBusinesses(supabase, email, also);
    if (saved) return { error: `Added, but couldn't save their other businesses: ${saved}` };
  }
  revalidatePath("/people");
  const failed = await emailInvite(email, member.full_name || workspace.owner_name || workspace.name, workspace.name);
  return failed
    ? { ok: `Added, but the invite email didn't send (${failed}). Use Send invite next to their name to try again.` }
    : { ok: `Added. We've emailed ${email} a link to sign in.` };
}

// Emails someone already on the People page a fresh sign-in link.
export async function inviteMember(email: string, _prev: AddState): Promise<AddState> {
  const { supabase, member, workspace } = await requireEditor(["designer"]);
  const { data: found } = await supabase.from("members").select("email").eq("email", email).maybeSingle();
  if (!found) return { error: "They're not on your list." };
  const failed = await emailInvite(email, member.full_name || workspace.owner_name || workspace.name, workspace.name);
  return failed ? { error: failed } : { ok: "Invite sent" };
}

export async function removeMember(email: string) {
  const { supabase, member } = await requireEditor(["designer"]);
  if (email === member.email) return;
  await supabase.from("members").delete().eq("email", email);
  revalidatePath("/people");
}

// The other businesses a client can request work for, besides their main one.
export async function setOtherBusinesses(email: string, formData: FormData) {
  const { supabase } = await requireEditor(["designer"]);
  const { data: found } = await supabase.from("members").select("business_id").eq("email", email).maybeSingle<{ business_id: string | null }>();
  if (!found) return;
  await saveOtherBusinesses(supabase, email, formData.getAll("also").map(String).filter((id) => id && id !== found.business_id));
  revalidatePath("/people");
}

async function saveOtherBusinesses(supabase: Awaited<ReturnType<typeof createClient>>, email: string, ids: string[]) {
  const { error } = await supabase.from("member_businesses").delete().eq("email", email);
  if (error) return error.message;
  if (!ids.length) return null;
  const { error: addError } = await supabase.from("member_businesses").insert([...new Set(ids)].map((business_id) => ({ email, business_id })));
  return addError?.message ?? null;
}

// See the request pages exactly as one client sees them, read-only, until "Exit preview".
export async function startPreview(formData: FormData) {
  const { businesses } = await requireEditor(["designer"]);
  const biz = businesses.find((b) => b.id === String(formData.get("business") ?? ""));
  if (!biz) return;
  (await cookies()).set(PREVIEW_COOKIE, biz.id, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 2 });
  redirect("/portal");
}

export async function stopPreview() {
  (await cookies()).delete(PREVIEW_COOKIE);
  redirect("/people");
}
