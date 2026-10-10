import { redirect } from "next/navigation";
import type { Ctx } from "./priority";
import { createClient } from "./supabase/server";
import type { Business, JobType, Member, Role, Stage, Workspace } from "./types";
import { termsFor } from "./workspace";

export const HOME: Record<Role, string> = { designer: "/queue", manager: "/overview", client: "/portal" };

// Loads the signed-in member and their workspace, or sends them to sign in. Pass roles to restrict a page.
export async function requireMember(roles?: Role[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("members")
    .select("email, full_name, role, business_id, workspace_id")
    .eq("email", (user.email ?? "").toLowerCase())
    .maybeSingle<Member & { workspace_id: string }>();
  if (!member) redirect("/login?error=no-access");
  if (roles && !roles.includes(member.role)) redirect(HOME[member.role]);

  const [{ data: businesses }, { data: workspace }, { data: stages }, { data: types }, { data: isAdmin }] = await Promise.all([
    supabase.from("businesses").select("*").order("name").returns<Business[]>(),
    supabase.from("workspaces").select("id, name, kind, owner_name").eq("id", member.workspace_id).single<Workspace>(),
    supabase.from("stages").select("*").order("position").order("id").returns<Stage[]>(),
    supabase.from("job_types").select("*").order("position").order("id").returns<JobType[]>(),
    supabase.rpc("is_platform_admin"),
  ]);
  const ws: Workspace = workspace ?? { id: member.workspace_id, name: "Oatcake", kind: "studio", owner_name: "" };
  const ctx: Ctx = { stages: stages ?? [], types: types ?? [] };
  const terms = termsFor(ws.kind);
  const shell = { member, businesses: businesses ?? [], workspace: ws, isAdmin: Boolean(isAdmin) };
  return { supabase, member, businesses: businesses ?? [], workspace: ws, ctx, terms, shell };
}
