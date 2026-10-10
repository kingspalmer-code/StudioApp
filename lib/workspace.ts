import type { WorkspaceKind } from "./types";

// The words each kind of workspace uses: a design studio takes requests from businesses,
// a trade like signwriting tracks jobs for customers.
const TERMS = {
  studio: { job: "request", jobs: "requests", Job: "Request", Jobs: "Requests", client: "business", clients: "businesses", Client: "Business", Clients: "Businesses" },
  trade: { job: "job", jobs: "jobs", Job: "Job", Jobs: "Jobs", client: "customer", clients: "customers", Client: "Customer", Clients: "Customers" },
};

export type Terms = (typeof TERMS)["studio"];
export const termsFor = (kind: WorkspaceKind): Terms => TERMS[kind] ?? TERMS.studio;

export function slugify(name: string): string {
  const base = name.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "customer";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}
