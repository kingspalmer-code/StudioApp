import type { Business, WorkspaceKind } from "./types";

// The words each kind of workspace uses: a design studio takes requests from businesses,
// a trade like signwriting tracks jobs for customers, and someone working alone has projects.
const TERMS = {
  studio: { job: "request", jobs: "requests", Job: "Request", Jobs: "Requests", client: "business", clients: "businesses", Client: "Business", Clients: "Businesses" },
  trade: { job: "job", jobs: "jobs", Job: "Job", Jobs: "Jobs", client: "customer", clients: "customers", Client: "Customer", Clients: "Customers" },
  solo: { job: "project", jobs: "projects", Job: "Project", Jobs: "Projects", client: "customer", clients: "customers", Client: "Customer", Clients: "Customers" },
};

export type Terms = (typeof TERMS)["studio"];
export const termsFor = (kind: WorkspaceKind): Terms => TERMS[kind] ?? TERMS.studio;

export function slugify(name: string): string {
  const base = name.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "customer";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

// The three ways to use Oatcake, as asked at sign-up and in Settings > How you work.
export const MODES: { kind: WorkspaceKind; title: string; blurb: string; examples: string }[] = [
  { kind: "studio", title: "Businesses", blurb: "Companies send you requests and follow progress in their own portal.", examples: "Design studios, agencies, contractors" },
  { kind: "trade", title: "Customers", blurb: "Members of the public come to you for jobs, and you keep track of them here.", examples: "Signwriters, photographers, makers" },
  { kind: "solo", title: "Just me", blurb: "Your own projects. No clients, no portal.", examples: "Side projects, personal work, solo planning" },
];
export const modeTitle = (kind: WorkspaceKind) => MODES.find((m) => m.kind === kind)?.title ?? "Businesses";

// Only businesses log in; customers and solo workspaces are run by the owner alone.
export const clientsLogIn = (kind: WorkspaceKind) => kind === "studio";

// Solo projects still need a business row to hang off (tickets and file paths use one), so each
// solo workspace has a hidden one with a "self-" slug. It never shows as a client anywhere.
export const SELF_PREFIX = "self-";
export const isSelf = (b?: Pick<Business, "slug"> | null) => Boolean(b?.slug?.startsWith(SELF_PREFIX));
