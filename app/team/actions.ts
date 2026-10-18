"use server";

import { revalidatePath } from "next/cache";
import { AREAS, type Access } from "@/lib/access";
import { requireEditor } from "@/lib/session";

// The owner sets what an employee can see and change beyond their to-do list. Only the owner:
// an employee allowed to change Team still can't change anyone's access, their own included.
export async function setEmployeeAccess(email: string, access: Access): Promise<{ error?: string }> {
  const { supabase } = await requireEditor(["designer"]);
  const permissions = Object.fromEntries(AREAS.map((a) => [a, access[a] === "view" || access[a] === "edit" ? access[a] : "none"]));
  const { error } = await supabase.from("members").update({ permissions }).eq("email", email).eq("role", "staff");
  if (error) return { error: "That didn't save. Try again." };
  revalidatePath("/team");
  return {};
}
