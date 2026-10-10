"use server";

import { revalidatePath } from "next/cache";
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
  revalidatePath("/admin");
  return { ok: `Done. ${get("owner_name")} can now sign in at oatcake.xyz with ${get("email").toLowerCase()}.` };
}
