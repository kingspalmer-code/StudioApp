"use server";

import { revalidatePath } from "next/cache";
import { emailInvite } from "@/lib/invite";
import { todayISO } from "@/lib/priority";
import { requireEditor } from "@/lib/session";

function refresh() {
  revalidatePath("/tasks");
  revalidatePath("/team");
}

// Adds a to-do. The owner picks whose list it goes on; an employee can only add to their own.
export async function addStaffTask(formData: FormData) {
  const { supabase, member } = await requireEditor(["designer", "staff"]);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const assignee = member.role === "staff" ? member.email : String(formData.get("assignee") ?? "");
  const daily = formData.get("daily") === "on";
  const due = daily ? null : String(formData.get("due") ?? "") || null;
  await supabase.from("staff_tasks").insert({ assignee, title: title.slice(0, 300), due, daily });
  refresh();
}

// Ticks a task off, or unticks it. A daily task is ticked for today only.
export async function setStaffTaskDone(id: number, daily: boolean, done: boolean) {
  const { supabase } = await requireEditor(["designer", "staff"]);
  const day = todayISO();
  if (done) {
    await supabase.from("staff_task_ticks").upsert({ task_id: id, day, done: true, done_at: new Date().toISOString() }, { onConflict: "task_id,day" });
  } else if (daily) {
    await supabase.from("staff_task_ticks").update({ done: false }).eq("task_id", id).eq("day", day);
  } else {
    await supabase.from("staff_task_ticks").update({ done: false }).eq("task_id", id);
  }
  refresh();
}

// A note on how a ticked-off task went, kept with that day's tick.
export async function saveStaffNote(id: number, day: string, formData: FormData) {
  const { supabase } = await requireEditor(["designer", "staff"]);
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  await supabase.from("staff_task_ticks").update({ note }).eq("task_id", id).eq("day", day);
  refresh();
}

export async function setStaffTaskDue(id: number, due: string | null) {
  const { supabase } = await requireEditor(["designer", "staff"]);
  await supabase.from("staff_tasks").update({ due }).eq("id", id);
  refresh();
}

// Takes a task off the list. Its ticks stay in the database, out of sight.
export async function removeStaffTask(id: number) {
  const { supabase } = await requireEditor(["designer", "staff"]);
  await supabase.from("staff_tasks").update({ gone: true }).eq("id", id);
  refresh();
}

export type EmployeeState = { error?: string; ok?: string; email?: string } | null;

// Adds an employee and emails them a sign-in link. They land on their to-do list.
export async function addEmployee(_prev: EmployeeState, formData: FormData): Promise<EmployeeState> {
  const { supabase, member, workspace } = await requireEditor(["designer"]);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  const { data: existing } = await supabase.from("members").select("role").eq("email", email).maybeSingle<{ role: string }>();
  if (existing && existing.role !== "staff") return { error: "That email already has a different kind of access here." };
  const { error } = await supabase.from("members").upsert({ email, full_name, role: "staff", business_id: null });
  if (error) {
    return { error: error.message.includes("members_pkey") || error.code === "42501" ? "That email is already using Oatcake somewhere else." : `Couldn't save: ${error.message}` };
  }
  refresh();
  const failed = await emailInvite(email, member.full_name || workspace.owner_name || workspace.name, workspace.name);
  return failed
    ? { ok: `Added, but the invite email didn't send (${failed}). Send them the invite link instead.`, email }
    : { ok: `Added. We've emailed ${email} a link to sign in.`, email };
}

// Emails an employee a fresh sign-in link.
export async function reinviteEmployee(email: string) {
  const { supabase, member, workspace } = await requireEditor(["designer"]);
  const { data: found } = await supabase.from("members").select("email").eq("email", email).eq("role", "staff").maybeSingle();
  if (!found) return { error: "They're not on your team." };
  const failed = await emailInvite(email, member.full_name || workspace.owner_name || workspace.name, workspace.name);
  return failed ? { error: failed } : { ok: "Invite sent" };
}

// Takes away an employee's access. Their tasks go with them.
export async function removeEmployee(email: string) {
  const { supabase } = await requireEditor(["designer"]);
  await supabase.from("members").delete().eq("email", email).eq("role", "staff");
  refresh();
}
