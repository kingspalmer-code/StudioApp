import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Business, Member, Role } from "./types";

export const HOME: Record<Role, string> = { designer: "/queue", manager: "/overview", client: "/portal" };

// Loads the signed-in member, or sends them to sign in. Pass roles to restrict a page.
export async function requireMember(roles?: Role[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("members")
    .select("email, full_name, role, business_id")
    .eq("email", (user.email ?? "").toLowerCase())
    .maybeSingle<Member>();
  if (!member) redirect("/login?error=no-access");
  if (roles && !roles.includes(member.role)) redirect(HOME[member.role]);

  const { data: businesses } = await supabase.from("businesses").select("*").order("name").returns<Business[]>();
  return { supabase, member, businesses: businesses ?? [] };
}
