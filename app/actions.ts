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
import type { Role, Status } from "@/lib/types";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function setStatus(id: number, status: Status) {
  const { supabase, ctx } = await requireEditor(["designer"]);
  if (!ctx.stages.some((s) => s.key === status)) return;
  await supabase.from("tickets").update({ status }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function setPinned(id: number, pinned: boolean) {
  const { supabase } = await requireEditor(["designer"]);
  await supabase.from("tickets").update({ pinned }).eq("id", id);
  revalidatePath("/", "layout");
}

// Saves the job's form fields from the job page. Fields not on the page are left as they are.
export async function saveDetails(id: number, formData: FormData) {
  const { supabase, ctx } = await requireEditor(["designer"]);
  const [{ data: t }, { data: fields }] = await Promise.all([
    supabase.from("tickets").select("type, details").eq("id", id).maybeSingle<{ type: string; details: Record<string, unknown> }>(),
    supabase.from("job_fields").select("*").returns<JobField[]>(),
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
  await supabase.from("tickets").update({ ...columns, details }).eq("id", id);
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
  const { supabase, ctx } = await requireEditor(["designer"]);
  const final = ctx.stages[ctx.stages.length - 1]?.key;
  if (!final || !ids.length) return;
  await supabase.from("tickets").update({ status: final }).in("id", ids);
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
