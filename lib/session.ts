import { redirect } from "next/navigation";
import type { Ctx } from "./priority";
import { cookies } from "next/headers";
import { createClient, PREVIEW_COOKIE, VIEW_COOKIE } from "./supabase/server";
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
  const jar = await cookies();
  const rawView = jar.get(VIEW_COOKIE)?.value ?? "";
  const viewId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawView) ? rawView : null;
  const [{ data: businesses }, { data: workspace }, { data: stages }, { data: types }, { data: isAdmin }, { data: replies }, { data: mine }] = await Promise.all([
    supabase.from("businesses").select("*").order("name").returns<Business[]>(),
    supabase
      .from("workspaces")
      .select("id, name, kind, owner_name")
      .in("id", viewId ? [member.workspace_id, viewId] : [member.workspace_id])
      .returns<Workspace[]>(),
    supabase.from("stages").select("*").order("position").order("id").returns<Stage[]>(),
    supabase.from("job_types").select("*").order("position").order("id").returns<JobType[]>(),
    supabase.rpc("is_platform_admin"),
    supabase.from("support_tickets").select("updated_at, user_seen_at").eq("user_id", user.id).eq("last_from", "oatcake").neq("status", "solved"),
    // Every business a client (or manager) can request work for: a client's main one first, then any others.
    member.role !== "designer" ? supabase.rpc("my_businesses") : Promise.resolve({ data: [] as string[] }),
  ]);
  const extra = ((mine as string[] | null) ?? []).filter((id) => id !== member.business_id);
  member.business_ids = member.business_id ? [member.business_id, ...extra] : extra;
  const viewed = isAdmin && viewId && viewId !== member.workspace_id ? workspace?.find((w) => w.id === viewId) : undefined;
  const own = workspace?.find((w) => w.id === member.workspace_id);
  const ws: Workspace = viewed ?? own ?? { id: member.workspace_id, name: "Oatcake", kind: "studio", owner_name: "" };
  const viewing = Boolean(viewed);
  // The studio previewing one client's request pages; only the client pages act on it (see asClient).
  const rawPreview = jar.get(PREVIEW_COOKIE)?.value ?? "";
  const preview = member.role === "designer" && !viewing ? (businesses ?? []).find((b) => b.id === rawPreview) : undefined;
  const ctx: Ctx = { stages: stages ?? [], types: types ?? [] };
  const terms = termsFor(ws.kind);
  const avatar = typeof user.user_metadata?.avatar_url === "string" ? (user.user_metadata.avatar_url as string) : null;
  const initials = (member.full_name || member.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  // Everyone new to Ask Oatcake gets a gentle pointer to it for a week, until they've used it twice.
  const askOpens = Number(user.user_metadata?.ask_opens ?? 0);
  const askSince = Number(user.user_metadata?.ask_since ?? 0);
  const askHint = askOpens < 2 && (!askSince || Date.now() - askSince < 7 * 86400000);
  // A dot on your photo when Oatcake has replied to a help message you haven't read yet.
  const helpUnread = (replies ?? []).some((r) => r.updated_at > r.user_seen_at);
  // Usage stats are on unless you've turned them off in your account.
  const track = !user.user_metadata?.no_tracking;
  const shell = { member, businesses: businesses ?? [], workspace: ws, isAdmin: Boolean(isAdmin), viewing, avatar, initials, askHint, askOpens, askSince, helpUnread, track, preview: undefined as Business | undefined };
  return { supabase, member, businesses: businesses ?? [], workspace: ws, ctx, terms, shell, viewing, preview };
}

type Session = Awaited<ReturnType<typeof requireMember>>;

// Client pages call this so that, while the studio is previewing a client, they render exactly as
// that client sees them. The shell shows a preview bar and makes the page read-only.
export function asClient<S extends Session>(session: S, businessId?: string): S {
  const { preview } = session;
  if (!preview || (businessId && businessId !== preview.id)) return session;
  const member = { ...session.member, role: "client" as Role, business_id: preview.id, business_ids: [preview.id] };
  return { ...session, member, shell: { ...session.shell, member, preview } };
}

// For anything that changes data: an admin viewing someone else's workspace can only look.
export async function requireEditor(roles?: Role[]) {
  const session = await requireMember(roles);
  if (session.viewing) redirect("/queue");
  return session;
}
