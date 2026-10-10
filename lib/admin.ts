import { redirect } from "next/navigation";
import { requireMember } from "./session";

// Shared bits for the admin area. Only Oatcake admins get in; everyone else goes home.
export async function requireAdmin() {
  const session = await requireMember();
  if (!session.shell.isAdmin) redirect("/");
  return session;
}

export type Person = {
  user_id: string;
  email: string;
  name: string;
  signed_up: string;
  last_sign_in: string | null;
  workspace_id: string | null;
  workspace: string | null;
  kind: string | null;
  role: string | null;
  is_admin: boolean;
  walkthrough: boolean;
  no_tracking: boolean;
  jobs: number;
  customers: number;
  docs: number;
  docs_sent: number;
  active_ms_7d: number;
  active_ms: number;
  days_active: number;
  last_seen: string | null;
  open_help: number;
};

// The steps a new workspace owner goes through, in order. Used for the set-up funnel and each person's progress.
export const STEPS: { key: string; label: string; missing: string; done: (p: Person) => boolean }[] = [
  { key: "signed", label: "Signed up", missing: "", done: () => true },
  { key: "workspace", label: "Set up a workspace", missing: "No workspace yet", done: (p) => Boolean(p.workspace_id) },
  { key: "job", label: "Added a job", missing: "No jobs yet", done: (p) => p.jobs > 0 },
  { key: "customer", label: "Added a customer", missing: "No customers yet", done: (p) => p.customers > 0 },
  { key: "doc", label: "Made a quote or invoice", missing: "No quotes or invoices yet", done: (p) => p.docs > 0 },
  { key: "sent", label: "Sent one", missing: "Hasn't sent a quote or invoice", done: (p) => p.docs_sent > 0 },
  { key: "back", label: "Came back another day", missing: "Hasn't come back yet", done: (p) => p.days_active >= 2 },
];

// Owners (and people who haven't finished signing up) are the ones whose set-up matters.
export const isOwner = (p: Person) => !p.is_admin && (p.role === "designer" || !p.role);

export const nextStep = (p: Person) => STEPS.find((s) => !s.done(p));

export function duration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function since(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "Europe/London" });
}

const PAGES: Record<string, string> = {
  "/queue": "Jobs",
  "/overview": "Overview",
  "/portal": "New job",
  "/customers": "Customers",
  "/people": "People",
  "/personal": "Personal",
  "/tickets/[id]": "A job",
  "/documents/[id]": "A quote or invoice",
  "/settings": "Settings",
  "/settings/form": "Settings › Job form",
  "/settings/documents": "Settings › Quote style",
  "/account": "Account",
  "/help": "Help",
  "/help/[id]": "Help conversation",
  "/welcome": "Sign-up set-up",
  "/": "Home",
};

export const pageName = (path: string) => PAGES[path] ?? path;

export const PROBLEM: Record<string, string> = {
  shown: "Error shown",
  crash: "Something broke",
  rage: "Tapped again and again",
  walkthrough_skip: "Skipped the walkthrough",
};

// The admin functions return lists; this unwraps one with its row type.
export async function list<T>(q: PromiseLike<{ data: unknown }>): Promise<T[]> {
  return ((await q).data as T[] | null) ?? [];
}
