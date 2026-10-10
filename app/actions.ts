"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { appliesTo, readFields, type JobField } from "@/lib/fields";
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

export async function addNote(id: number, formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  const { supabase, member } = await requireEditor(["designer", "client"]);
  await supabase.from("ticket_notes").insert({ ticket_id: id, body, author_name: member.full_name || member.email });
  revalidatePath(`/tickets/${id}`);
}

export async function addMember(_prev: string | null, formData: FormData): Promise<string | null> {
  const { supabase } = await requireEditor(["designer"]);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const business_id = role === "client" ? String(formData.get("business_id") ?? "") || null : null;
  if (!email.includes("@")) return "Enter a valid email address.";
  if (!["designer", "manager", "client"].includes(role)) return "Choose a role.";
  if (role === "client" && !business_id) return "Choose which business they work for.";
  const { error } = await supabase.from("members").upsert({ email, full_name, role, business_id });
  if (error) return `Couldn't save: ${error.message}`;
  revalidatePath("/people");
  return null;
}

export async function removeMember(email: string) {
  const { supabase, member } = await requireEditor(["designer"]);
  if (email === member.email) return;
  await supabase.from("members").delete().eq("email", email);
  revalidatePath("/people");
}
