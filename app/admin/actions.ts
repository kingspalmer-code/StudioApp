"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VIEW_COOKIE } from "@/lib/supabase/server";
import { requireMember } from "@/lib/session";

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
