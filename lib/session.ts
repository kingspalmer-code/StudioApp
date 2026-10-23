import { cleanPalette } from "./palette";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Ctx } from "./priority";
import { cookies } from "next/headers";
import { createClient, PREVIEW_COOKIE, VIEW_COOKIE } from "./supabase/server";
import type { Business, JobType, Member, Role, Stage, Workspace } from "./types";
import { clientsLogIn, isSelf, termsFor } from "./workspace";
import { accessFor, allows, hasAny, type Area } from "./access";
import { OWNER_HIDDEN_BY_DEFAULT } from "./menu";
import { datesOff } from "./core-fields";

export const HOME: Record<Role, string> = { designer: "/queue", manager: "/overview", client: "/overview", staff: "/calendar" };

// Loads the signed-in member and their workspace, or sends them to sign in. Pass roles to restrict a page.
// Every database call goes out at once: the sign-in is checked from the session token itself, so
// nothing waits on anything else. Cached so a page and its parts share one load per request.
//
// area names which part of the owner's side a page or action belongs to. An employee the owner let
// into that area gets the owner's view of it (role "designer"), read-only if they may only look;
// the database checks the same access (public.can()). Without an area, owner-only pages stay
// owner-only. Everywhere else an employee is staff, as before.
// A page that belongs to more than one area (Settings holds quotes too) names them all; the first
// one the employee may see decides.
export async function requireMember(roles?: Role[], areas?: Area | Area[]) {
  const session = await loadMember();
  const { member } = session;
  const area = [areas ?? []].flat().find((a) => allows(member.access, a));
  // Something both sides do (like ticking a task) stays the employee's own unless they may change the area.
  const look = !area || !allows(member.access, area, "edit");
  if (member.staff && (!roles || roles.includes("designer")) && area && allows(member.access, area) && !(look && roles?.includes("staff"))) {
    const owner = { ...member, role: "designer" as Role };
    return { ...session, member: owner, viewing: session.viewing || look, shell: { ...session.shell, member: owner, readOnly: look } };
  }
  if (roles && !roles.includes(member.role)) redirect(HOME[member.role]);
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
  const [{ data: row }, { data: businesses }, { data: viewedRows }, { data: stages }, { data: types }, { data: isAdmin }, { data: replies }, { data: mine }, { data: appRows }] = await Promise.all([
    supabase
      .from("members")
      .select("email, full_name, role, business_id, permissions, workspace_id, workspaces(id, name, kind, owner_name, request_slug, requests_open, core_fields)")
      .eq("email", email)
      .maybeSingle<Member & { workspace_id: string; workspaces: Workspace | null }>(),
    supabase.from("businesses").select("*").order("name").returns<Business[]>(),
    viewId ? supabase.from("workspaces").select("id, name, kind, owner_name, core_fields").eq("id", viewId).returns<Workspace[]>() : Promise.resolve({ data: [] as Workspace[] }),
    supabase.from("stages").select("*").order("position").order("id").returns<Stage[]>(),
    supabase.from("job_types").select("*").order("position").order("id").returns<JobType[]>(),
    supabase.rpc("is_platform_admin"),
    supabase.from("support_tickets").select("updated_at, user_seen_at").eq("user_id", userId).eq("last_from", "oatcake").neq("status", "solved"),
    // Every business a client (or manager) can request work for: a client's main one first, then any others.
    supabase.rpc("my_businesses"),
    // Apps they can open, for the Apps tab in a client's portal.
    supabase.from("apps").select("business_id").returns<{ business_id: string }[]>(),
  ]);
  // Profile details (photo, hints, menu choices) come from the sign-in token, so pages don't wait on
  // the sign-in server. Saving them renews the token straight away (saveProfile in lib/supabase/client.ts).
  const user = { user_metadata: (claims?.claims.user_metadata ?? {}) as Record<string, unknown> };
  // Signed in but no workspace yet: set one up.
  if (!row) redirect("/welcome");
  const { workspaces: ownWorkspace, ...member } = row;
  const workspace = [...(viewedRows ?? []), ...(ownWorkspace ? [ownWorkspace] : [])];
  const extra = member.role === "designer" ? [] : ((mine as string[] | null) ?? []).filter((id) => id !== member.business_id);
  member.business_ids = member.business_id ? [member.business_id, ...extra] : extra;
  member.has_apps = Boolean(appRows?.length);
  member.access = accessFor(member.role, member.permissions);
  member.staff = member.role === "staff" && hasAny(member.access);
  // Which businesses have apps, so a preview of one client shows Apps only when they have one.
  const appBusinesses = (appRows ?? []).map((a) => a.business_id);
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
  const ctx: Ctx = { stages: stages ?? [], types: types ?? [], noDates: datesOff(ws.core_fields) };
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
  // Menu buttons switched off in Settings > Menu on computers (including the Mac app), and the ones
  // picked for the phone tab bar (none saved yet means the default few, see lib/menu.ts).
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const phoneTabs = Array.isArray(user.user_metadata?.phone_tabs) ? list(user.user_metadata.phone_tabs) : undefined;
  const hidden = { phoneTabs, computer: Array.isArray(user.user_metadata?.hide_computer) ? list(user.user_metadata.hide_computer) : member.role === "designer" ? OWNER_HIDDEN_BY_DEFAULT : [], order: list(user.user_metadata?.menu_order), pins: list(user.user_metadata?.menu_pins), admin: Array.isArray(user.user_metadata?.admin_menu) ? list(user.user_metadata.admin_menu) : undefined };
  // Their own colour theme, if they've picked one (components/Colours.tsx).
  const palette = cleanPalette(user.user_metadata?.palette);
  const shell = { member, businesses: clients, workspace: ws, isAdmin: Boolean(isAdmin), viewing, readOnly: false, avatar, initials, askHint, askOpens, askSince, helpUnread, track, hidden, palette, preview: undefined as Business | undefined };
  // How Queue and Overview are laid out (Customise, lib/layouts.ts). Someone viewing another
  // workspace sees its pages as they come.
  const layouts = { queue: viewing ? undefined : user.user_metadata?.layout_queue, overview: viewing ? undefined : user.user_metadata?.layout_overview } as Record<"queue" | "overview", unknown>;
  // Priority list or Board for the jobs, whichever they last picked (components/ViewSwitch.tsx).
  const jobsView = !viewing && user.user_metadata?.jobs_view === "board" ? "board" : "list";
  // Your week on To-do (lib/routine.ts): what happens every week, like office days.
  const routine = viewing ? undefined : user.user_metadata?.routine;
  // To-do opens on the calendar or Cards, whichever they last picked.
  const todoView: "list" | "cards" = !viewing && user.user_metadata?.todo_view === "cards" ? "cards" : "list";
  return { supabase, member, businesses: clients, self, workspace: ws, ctx, terms, shell, viewing, preview, appBusinesses, layouts, jobsView, routine, todoView };
});

type Session = Awaited<ReturnType<typeof requireMember>>;

// Client pages call this so that, while the studio is previewing a client, they render exactly as
// that client sees them. The shell shows a preview bar and makes the page read-only.
export function asClient<S extends Session>(session: S, businessId?: string): S {
  const { preview } = session;
  if (!preview || (businessId && businessId !== preview.id)) return session;
  const member = { ...session.member, role: "client" as Role, business_id: preview.id, business_ids: [preview.id], has_apps: session.appBusinesses.includes(preview.id) };
  return { ...session, member, shell: { ...session.shell, member, preview } };
}

// For anything that changes data: an admin viewing someone else's workspace can only look, and so
// can an employee who may only look at this area.
export async function requireEditor(roles?: Role[], area?: Area) {
  const session = await requireMember(roles, area);
  if (session.viewing) redirect("/queue");
  return session;
}
