// What an employee can see and change beyond their own to-do list. The owner sets it on Team, one
// level per area; the database enforces the same thing (public.can(), migration 036).
export type Area = "requests" | "clients" | "quotes" | "team" | "settings";
export type Level = "none" | "view" | "edit";
export type Access = Record<Area, Level>;

export const AREAS: Area[] = ["requests", "clients", "quotes", "team", "settings"];

export const NO_ACCESS: Access = { requests: "none", clients: "none", quotes: "none", team: "none", settings: "none" };
export const FULL_ACCESS: Access = { requests: "edit", clients: "edit", quotes: "edit", team: "edit", settings: "edit" };

// Ready-made sets the owner can start from. To-do only is how employees worked before this.
export const PRESETS: { key: string; label: string; sub: string; access: Access }[] = [
  { key: "todo", label: "To-do only", sub: "Just their own list", access: NO_ACCESS },
  { key: "look", label: "Look, don't touch", sub: "Sees everything, changes nothing", access: { requests: "view", clients: "view", quotes: "view", team: "view", settings: "view" } },
  { key: "full", label: "Full access", sub: "Everything you can do, apart from managing the team's access", access: FULL_ACCESS },
];

const LEVELS: Level[] = ["none", "view", "edit"];
const levelOf = (v: unknown): Level => (LEVELS.includes(v as Level) ? (v as Level) : "none");

// Reads the permissions column. The owner can do everything; clients and managers get nothing here
// (what they see is set by their own role).
export function accessFor(role: string, permissions: unknown): Access {
  if (role === "designer") return FULL_ACCESS;
  if (role !== "staff" || !permissions || typeof permissions !== "object") return NO_ACCESS;
  const p = permissions as Record<string, unknown>;
  return Object.fromEntries(AREAS.map((a) => [a, levelOf(p[a])])) as Access;
}

export const allows = (access: Access | undefined, area: Area, need: "view" | "edit" = "view") =>
  Boolean(access) && (access![area] === "edit" || (need === "view" && access![area] === "view"));

export const hasAny = (access: Access | undefined) => AREAS.some((a) => allows(access, a));

export const presetFor = (access: Access) => PRESETS.find((p) => AREAS.every((a) => p.access[a] === access[a]))?.key;
