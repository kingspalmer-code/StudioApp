"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Role, Status } from "@/lib/types";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function setStatus(id: number, status: Status) {
  const { supabase, ctx } = await requireMember(["designer"]);
  if (!ctx.stages.some((s) => s.key === status)) return;
  await supabase.from("tickets").update({ status }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function setPinned(id: number, pinned: boolean) {
  const { supabase } = await requireMember(["designer"]);
  await supabase.from("tickets").update({ pinned }).eq("id", id);
  revalidatePath("/", "layout");
}

// Quote, payment and site details on a trade job.
export async function updateJob(id: number, formData: FormData) {
  const { supabase } = await requireMember(["designer"]);
  const amount = (k: string) => {
    const n = parseFloat(String(formData.get(k) ?? "").replace(/[£,\s]/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  };
  await supabase
    .from("tickets")
    .update({
      quote_amount: amount("quote_amount"),
      paid_amount: amount("paid_amount"),
      site_address: String(formData.get("site_address") ?? "").trim(),
    })
    .eq("id", id);
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/queue");
}

export async function deleteTicket(id: number) {
  const { supabase } = await requireMember(["designer"]);
  const { data: files } = await supabase.from("ticket_files").select("path").eq("ticket_id", id);
  if (files?.length) await supabase.storage.from("inspiration").remove(files.map((f) => f.path));
  await supabase.from("tickets").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/queue");
}

export async function addNote(id: number, formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  const { supabase, member } = await requireMember(["designer", "client"]);
  await supabase.from("ticket_notes").insert({ ticket_id: id, body, author_name: member.full_name || member.email });
  revalidatePath(`/tickets/${id}`);
}

export async function addMember(_prev: string | null, formData: FormData): Promise<string | null> {
  const { supabase } = await requireMember(["designer"]);
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
  const { supabase, member } = await requireMember(["designer"]);
  if (email === member.email) return;
  await supabase.from("members").delete().eq("email", email);
  revalidatePath("/people");
}
