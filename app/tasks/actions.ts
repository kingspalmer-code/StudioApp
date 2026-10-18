"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { emailInvite } from "@/lib/invite";
import { sendAlert } from "@/lib/push";
import type { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/priority";
import { requireEditor } from "@/lib/session";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function refresh() {
  revalidatePath("/tasks");
  revalidatePath("/team");
}

// Phone alerts for a task go to whoever task_people says should hear: the employee when the owner
// does something, the owners when the employee does.
// The lookup happens now, with the signed-in session; the sending happens after the page responds.
async function alertTask(supabase: Supabase, id: number, title: string, body: string) {
  const { data } = await supabase.rpc("task_people", { p_task: id });
  const emails = (data as string[] | null) ?? [];
  if (emails.length) after(() => sendAlert(emails, { title, body: body.slice(0, 160), url: `/tasks/${id}`, tag: `task-${id}` }).catch(() => 0));
}

const who = (m: { full_name: string; email: string }) => m.full_name.split(" ")[0] || m.email;

// Adds a to-do. The owner picks whose list it goes on; an employee can only add to their own.
export async function addStaffTask(formData: FormData) {
  const { supabase, member } = await requireEditor(["designer", "staff"], "team");
  const title = String(formData.get("title") ?? "").trim().slice(0, 300);
  if (!title) return;
  const assignee = member.role === "staff" ? member.email : String(formData.get("assignee") || member.email);
  const daily = formData.get("daily") === "on";
  const due = daily ? null : String(formData.get("due") ?? "") || null;
  const details = String(formData.get("details") ?? "").trim().slice(0, 2000);
  const { data } = await supabase.from("staff_tasks").insert({ assignee, title, due, daily, details }).select("id").maybeSingle<{ id: number }>();
  if (data && member.role === "designer") await alertTask(supabase, data.id, `New task from ${who(member)}`, title);
  refresh();
}

// Ticks a task off, or unticks it. A daily task is ticked for today only. An employee ticking a
// one-off task asks for sign-off; the owner ticking one signs it off there and then.
export async function setStaffTaskDone(id: number, daily: boolean, done: boolean, title: string) {
  const { supabase, member } = await requireEditor(["designer", "staff"], "team");
  const day = todayISO();
  // An employee allowed to change Team signs off other people's tasks, but asks for sign-off on their own.
  let owner = member.role === "designer";
  if (owner && member.staff) {
    const { data: task } = await supabase.from("staff_tasks").select("assignee").eq("id", id).maybeSingle<{ assignee: string }>();
    owner = task?.assignee !== member.email;
  }
  if (done) {
    const now = new Date().toISOString();
    await supabase
      .from("staff_task_ticks")
      .upsert({ task_id: id, day, done: true, done_at: now, confirmed_at: !daily && owner ? now : null }, { onConflict: "task_id,day" });
    if (!daily && !owner) {
      await supabase.from("staff_task_notes").insert({ task_id: id, kind: "ask" });
      await alertTask(supabase, id, `${who(member)} finished a task`, `${title}. Tap to sign it off.`);
    }
  } else if (daily) {
    await supabase.from("staff_task_ticks").update({ done: false }).eq("task_id", id).eq("day", day);
  } else {
    await supabase.from("staff_task_ticks").update({ done: false, confirmed_at: null }).eq("task_id", id);
  }
  refresh();
}

// The owner signs off a task the employee says is finished.
export async function confirmStaffTask(id: number, title: string) {
  const { supabase, member } = await requireEditor(["designer"], "team");
  await supabase.from("staff_task_ticks").update({ confirmed_at: new Date().toISOString() }).eq("task_id", id).eq("done", true).is("confirmed_at", null);
  await supabase.from("staff_task_notes").insert({ task_id: id, kind: "confirm" });
  await alertTask(supabase, id, `${who(member)} signed off a task`, title);
  refresh();
}

// The owner sends a task back to do again, saying why.
export async function reopenStaffTask(id: number, title: string, formData: FormData) {
  const { supabase, member } = await requireEditor(["designer"], "team");
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  await supabase.from("staff_task_ticks").update({ done: false, confirmed_at: null }).eq("task_id", id);
  await supabase.from("staff_task_notes").insert({ task_id: id, kind: "reopen", body });
  await alertTask(supabase, id, `${who(member)} sent a task back`, body ? `${title}: ${body}` : title);
  refresh();
}

// A note or reply on a task.
export async function addTaskNote(id: number, title: string, formData: FormData) {
  const { supabase, member } = await requireEditor(["designer", "staff"], "team");
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!body) return;
  await supabase.from("staff_task_notes").insert({ task_id: id, kind: "note", body });
  await alertTask(supabase, id, `${who(member)} on ${title}`, body);
  refresh();
}

// The owner's notes on what a task involves.
export async function saveTaskDetails(id: number, formData: FormData) {
  const { supabase } = await requireEditor(["designer"], "team");
  await supabase.from("staff_tasks").update({ details: String(formData.get("details") ?? "").trim().slice(0, 2000) }).eq("id", id);
  refresh();
}

export async function setStaffTaskDue(id: number, due: string | null) {
  const { supabase } = await requireEditor(["designer", "staff"], "team");
  await supabase.from("staff_tasks").update({ due }).eq("id", id);
  refresh();
}

// Takes a task off the list. Its ticks stay in the database, out of sight.
export async function removeStaffTask(id: number) {
  const { supabase } = await requireEditor(["designer", "staff"], "team");
  await supabase.from("staff_tasks").update({ gone: true }).eq("id", id);
  refresh();
}

export type EmployeeState = { error?: string; ok?: string; email?: string } | null;

// Adds an employee and emails them a sign-in link. They land on their to-do list.
export async function addEmployee(_prev: EmployeeState, formData: FormData): Promise<EmployeeState> {
  const { supabase, member, workspace } = await requireEditor(["designer"], "team");
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
  const { supabase, member, workspace } = await requireEditor(["designer"], "team");
  const { data: found } = await supabase.from("members").select("email").eq("email", email).eq("role", "staff").maybeSingle();
  if (!found) return { error: "They're not on your team." };
  const failed = await emailInvite(email, member.full_name || workspace.owner_name || workspace.name, workspace.name);
  return failed ? { error: failed } : { ok: "Invite sent" };
}

// Takes away an employee's access. Their tasks go with them.
export async function removeEmployee(email: string) {
  const { supabase } = await requireEditor(["designer"], "team");
  await supabase.from("members").delete().eq("email", email).eq("role", "staff");
  refresh();
}
