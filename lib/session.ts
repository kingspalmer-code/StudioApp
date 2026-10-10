import { redirect } from "next/navigation";
import type { Ctx } from "./priority";
import { cookies } from "next/headers";
import { createClient, VIEW_COOKIE } from "./supabase/server";
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
  // Signed in but no workspace yet: set one up.
  if (!member) redirect("/welcome");
  if (roles && !roles.includes(member.role)) redirect(HOME[member.role]);

  // An admin viewing someone else's workspace sees it read-only; the database enforces that too.
  const rawView = (await cookies()).get(VIEW_COOKIE)?.value ?? "";
  const viewId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawView) ? rawView : null;
  const [{ data: businesses }, { data: workspace }, { data: stages }, { data: types }, { data: isAdmin }] = await Promise.all([
    supabase.from("businesses").select("*").order("name").returns<Business[]>(),
    supabase
      .from("workspaces")
      .select("id, name, kind, owner_name")
      .in("id", viewId ? [member.workspace_id, viewId] : [member.workspace_id])
      .returns<Workspace[]>(),
    supabase.from("stages").select("*").order("position").order("id").returns<Stage[]>(),
    supabase.from("job_types").select("*").order("position").order("id").returns<JobType[]>(),
    supabase.rpc("is_platform_admin"),
  ]);
  const viewed = isAdmin && viewId && viewId !== member.workspace_id ? workspace?.find((w) => w.id === viewId) : undefined;
  const own = workspace?.find((w) => w.id === member.workspace_id);
  const ws: Workspace = viewed ?? own ?? { id: member.workspace_id, name: "Oatcake", kind: "studio", owner_name: "" };
  const viewing = Boolean(viewed);
  const ctx: Ctx = { stages: stages ?? [], types: types ?? [] };
  const terms = termsFor(ws.kind);
  const shell = { member, businesses: businesses ?? [], workspace: ws, isAdmin: Boolean(isAdmin), viewing };
  return { supabase, member, businesses: businesses ?? [], workspace: ws, ctx, terms, shell, viewing };
}

// For anything that changes data: an admin viewing someone else's workspace can only look.
export async function requireEditor(roles?: Role[]) {
  const session = await requireMember(roles);
  if (session.viewing) redirect("/queue");
  return session;
}
