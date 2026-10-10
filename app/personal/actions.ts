"use server";

import { revalidatePath } from "next/cache";
import { parseQuickAdd } from "@/lib/quickadd";
import { requireMember } from "@/lib/session";

export async function addTask(formData: FormData) {
  const raw = String(formData.get("title") ?? "").trim();
  if (!raw) return;
  const project = Number(formData.get("project_id")) || null;
  const defaultDue = String(formData.get("default_due") ?? "") || null;
  const { title, due, flagged } = parseQuickAdd(raw);
  const { supabase } = await requireMember(["designer"]);
  await supabase.from("personal_tasks").insert({ title, due: due ?? defaultDue, flagged, project_id: project });
  revalidatePath("/personal");
}

export async function setTaskDone(id: number, done: boolean) {
  const { supabase } = await requireMember(["designer"]);
  await supabase.from("personal_tasks").update({ done }).eq("id", id);
  revalidatePath("/personal");
}

export async function setTaskDue(id: number, due: string | null) {
  const { supabase } = await requireMember(["designer"]);
  await supabase.from("personal_tasks").update({ due }).eq("id", id);
  revalidatePath("/personal");
}

export async function setTaskFlag(id: number, flagged: boolean) {
  const { supabase } = await requireMember(["designer"]);
  await supabase.from("personal_tasks").update({ flagged }).eq("id", id);
  revalidatePath("/personal");
}

export async function deleteTask(id: number) {
  const { supabase } = await requireMember(["designer"]);
  await supabase.from("personal_tasks").delete().eq("id", id);
  revalidatePath("/personal");
}

export async function addProject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const color = String(formData.get("color") ?? "#382a25");
  const { supabase } = await requireMember(["designer"]);
  await supabase.from("personal_projects").insert({ name, color });
  revalidatePath("/personal");
}

export async function archiveProject(id: number) {
  const { supabase } = await requireMember(["designer"]);
  await supabase.from("personal_projects").update({ archived: true }).eq("id", id);
  revalidatePath("/personal");
}
