"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { VIEW_COOKIE } from "@/lib/supabase/server";
import { sendAlert } from "@/lib/push";
import { requireMember } from "@/lib/session";
import { sendNudge } from "@/lib/support";

type State = { error?: string; ok?: string } | null;

export async function createWorkspace(_prev: State, formData: FormData): Promise<State> {
  const { supabase, shell } = await requireMember();
  if (!shell.isAdmin) return { error: "Only Oatcake admins can do this." };
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const { error } = await supabase.rpc("create_workspace", {
    ws_name: get("name"),
    owner_email: get("email"),
    owner_name: get("owner_name"),
    ws_kind: get("kind"),
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/workspaces");
  return { ok: `Done. ${get("owner_name")} can now sign in at oatcake.xyz with ${get("email").toLowerCase()}.` };
}

// Look inside someone's workspace, read-only, until "Back to my workspace".
export async function viewWorkspace(id: string) {
  const { shell } = await requireMember();
  if (!shell.isAdmin) return;
  (await cookies()).set(VIEW_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 8 });
  redirect("/queue");
}

export async function stopViewing() {
  (await cookies()).delete(VIEW_COOKIE);
  redirect("/admin/workspaces");
}

// Nudge someone who signed up but hasn't got going: it's saved as a help conversation from Oatcake
// (so their reply comes back to Support), emailed from you, and sent to their phone if they have alerts on.
export async function nudgePerson(userId: string, _prev: State, fd: FormData): Promise<State> {
  const { supabase, shell, member } = await requireMember();
  if (!shell.isAdmin) return { error: "Only Oatcake admins can do this." };
  const subject = String(fd.get("subject") ?? "").trim() || "Getting set up on Oatcake";
  const body = String(fd.get("body") ?? "").trim();
  const booking = String(fd.get("booking") ?? "").trim();
  if (!body) return { error: "Write a message first." };
  if (booking && !/^https:\/\/\S+$/.test(booking)) return { error: "The booking link should start with https://" };
  const { data: id, error } = await supabase.rpc("support_nudge", { p_user: userId, p_subject: subject, p_body: body });
  if (error || !id) return { error: error?.message ?? "That didn't send. Try again." };
  const { data: t } = await supabase.from("support_tickets").select("email, name, workspace_id").eq("id", id).single<{ email: string; name: string; workspace_id: string | null }>();
  if (!t) return { error: "That didn't send. Try again." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const problem = await sendNudge({
    id,
    to: t.email,
    subject,
    body,
    fromName: member.full_name?.split(" ")[0] || "Oatcake",
    replyTo: user?.email ?? "support@oatcake.xyz",
    booking: booking || undefined,
    hasWorkspace: Boolean(t.workspace_id),
  });
  if (t.workspace_id) after(() => sendAlert([t.email], { title: subject, body: body.slice(0, 160), url: `/help/${id}`, tag: `nudge-${id}` }).catch(() => 0));
  revalidatePath(`/admin/people/${userId}`);
  revalidatePath("/admin/people");
  revalidatePath("/admin");
  if (problem) return { error: `Saved in Support, but ${problem.charAt(0).toLowerCase()}${problem.slice(1)}` };
  return { ok: `Nudge sent to ${t.name || t.email}` };
}
