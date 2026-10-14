import { cache } from "react";
import { redirect } from "next/navigation";
import type { Ctx } from "./priority";
import { cookies } from "next/headers";
import { createClient, PREVIEW_COOKIE, VIEW_COOKIE } from "./supabase/server";
import type { Business, JobType, Member, Role, Stage, Workspace } from "./types";
import { clientsLogIn, isSelf, termsFor } from "./workspace";

export const HOME: Record<Role, string> = { designer: "/queue", manager: "/overview", client: "/portal", staff: "/tasks" };

// Loads the signed-in member and their workspace, or sends them to sign in. Pass roles to restrict a page.
// Every database call goes out at once: the sign-in is checked from the session token itself, so
// nothing waits on anything else. Cached so a page and its parts share one load per request.
export async function requireMember(roles?: Role[]) {
  const session = await loadMember();
  if (roles && !roles.includes(session.member.role)) redirect(HOME[session.member.role]);
  return session;
}

const loadMember = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const email = typeof claims?.claims.email === "string" ? claims.claims.email.toLowerCase() : "";
  if (!userId) redirect("/login");

  // An admin viewing someone else's workspace sees it read-only; the database enforces that too.
  const jar = await cookies();
  const rawView = jar.get(VIEW_COOKIE)?.value ?? "";
  const viewId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawView) ? rawView : null;
  const [{ data: { user } }, { data: row }, { data: businesses }, { data: viewedRows }, { data: stages }, { data: types }, { data: isAdmin }, { data: replies }, { data: mine }] = await Promise.all([
    // For the profile details (photo, hints); the token's copy can be up to an hour old.
    supabase.auth.getUser(),
    supabase
      .from("members")
      .select("email, full_name, role, business_id, workspace_id, workspaces(id, name, kind, owner_name, request_slug, requests_open)")
      .eq("email", email)
      .maybeSingle<Member & { workspace_id: string; workspaces: Workspace | null }>(),
    supabase.from("businesses").select("*").order("name").returns<Business[]>(),
    viewId ? supabase.from("workspaces").select("id, name, kind, owner_name").eq("id", viewId).returns<Workspace[]>() : Promise.resolve({ data: [] as Workspace[] }),
    supabase.from("stages").select("*").order("position").order("id").returns<Stage[]>(),
    supabase.from("job_types").select("*").order("position").order("id").returns<JobType[]>(),
    supabase.rpc("is_platform_admin"),
    supabase.from("support_tickets").select("updated_at, user_seen_at").eq("user_id", userId).eq("last_from", "oatcake").neq("status", "solved"),
    // Every business a client (or manager) can request work for: a client's main one first, then any others.
    supabase.rpc("my_businesses"),
  ]);
  if (!user) redirect("/login");
  // Signed in but no workspace yet: set one up.
  if (!row) redirect("/welcome");
  const { workspaces: ownWorkspace, ...member } = row;
  const workspace = [...(viewedRows ?? []), ...(ownWorkspace ? [ownWorkspace] : [])];
  const extra = member.role === "designer" ? [] : ((mine as string[] | null) ?? []).filter((id) => id !== member.business_id);
  member.business_ids = member.business_id ? [member.business_id, ...extra] : extra;
  const viewed = isAdmin && viewId && viewId !== member.workspace_id ? workspace?.find((w) => w.id === viewId) : undefined;
  const own = workspace?.find((w) => w.id === member.workspace_id);
  const ws: Workspace = viewed ?? own ?? { id: member.workspace_id, name: "Oatcake", kind: "studio", owner_name: "" };
  const viewing = Boolean(viewed);
  // Clients and managers only have a way in while the workspace takes work from businesses. If the
  // owner switched to Customers or Just me, their logins are paused until it switches back.
  if ((member.role === "client" || member.role === "manager") && !clientsLogIn(ws.kind)) redirect("/paused");
  // The hidden business a solo workspace's projects belong to stays out of every list of clients.
  const self = (businesses ?? []).find(isSelf);
  const clients = (businesses ?? []).filter((b) => !isSelf(b));
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
  // Menu buttons switched off in Settings > Menu, on phones and on computers (including the Mac app).
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const hidden = { phone: list(user.user_metadata?.hide_phone), computer: list(user.user_metadata?.hide_computer) };
  const shell = { member, businesses: clients, workspace: ws, isAdmin: Boolean(isAdmin), viewing, avatar, initials, askHint, askOpens, askSince, helpUnread, track, hidden, preview: undefined as Business | undefined };
  return { supabase, member, businesses: clients, self, workspace: ws, ctx, terms, shell, viewing, preview };
});

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
