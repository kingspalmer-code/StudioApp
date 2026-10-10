import { ADDABLE_KINDS, type FieldKind } from "./fields";
import { STAGE_COLORS } from "./priority";

// A workspace setup suggested at sign-up from what someone says about their work.
// The same shape is saved by start_custom_workspace() in the database, which checks it again.
export const BUILTIN_KINDS = {
  formats: "text",
  brief: "longtext",
  copy: "longtext",
  links: "link",
  colours: "text",
  event_date: "date",
  requester_name: "text",
  approver: "text",
  site_address: "address",
  quote_amount: "money",
  paid_amount: "money",
  files: "files",
} as const satisfies Record<string, FieldKind>;
export type BuiltinKey = keyof typeof BUILTIN_KINDS;
const BUILTIN_KEYS = Object.keys(BUILTIN_KINDS) as BuiltinKey[];

export type SetupStage = { label: string; color: (typeof STAGE_COLORS)[number] };
export type SetupType = { name: string; lead_days: number };
export type SetupField = { use: BuiltinKey | "custom"; label: string; kind: FieldKind; hint: string; options: string[]; required: boolean };
// The nearest of the database's starting profiles, kept on the workspace for reference.
const PROFILE_KEYS = ["creative", "photo", "trades", "events", "content", "personal"] as const;

export type Setup = {
  base: (typeof PROFILE_KEYS)[number];
  workspace_name: string;
  clients_log_in: boolean;
  stages: SetupStage[];
  job_types: SetupType[];
  fields: SetupField[];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Tidies a suggestion so it always fits what Oatcake can store.
export function normalizeSetup(raw: unknown): Setup | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];

  const stages: SetupStage[] = [];
  for (const s of list(r.stages)) {
    const label = str(s?.label, 40);
    if (!label || stages.some((x) => x.label.toLowerCase() === label.toLowerCase())) continue;
    const color = (STAGE_COLORS as readonly string[]).includes(s.color as string) ? (s.color as SetupStage["color"]) : "blue";
    stages.push({ label, color });
  }

  const job_types: SetupType[] = [];
  for (const t of list(r.job_types)) {
    const name = str(t?.name, 50);
    if (!name || job_types.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
    const days = Math.round(Number(t.lead_days));
    job_types.push({ name, lead_days: Number.isFinite(days) ? Math.min(365, Math.max(0, days)) : 3 });
  }

  const fields: SetupField[] = [];
  for (const f of list(r.fields)) {
    const label = str(f?.label, 60);
    if (!label) continue;
    const use = BUILTIN_KEYS.includes(f.use as BuiltinKey) ? (f.use as BuiltinKey) : "custom";
    if (use !== "custom" && fields.some((x) => x.use === use)) continue;
    let kind: FieldKind = use === "custom" ? (ADDABLE_KINDS.includes(f.kind as FieldKind) ? (f.kind as FieldKind) : "text") : BUILTIN_KINDS[use];
    const options = kind === "select" ? list(f.options).map((o) => str(o, 40)).filter(Boolean).slice(0, 20) : [];
    if (kind === "select" && options.length < 2) kind = "text";
    fields.push({ use, label, kind, hint: str(f.hint, 120), options, required: kind !== "heading" && f.required === true });
  }

  if (stages.length < 2 || job_types.length < 1) return null;
  return {
    base: PROFILE_KEYS.includes(r.base as Setup["base"]) ? (r.base as Setup["base"]) : "personal",
    workspace_name: str(r.workspace_name, 80),
    clients_log_in: r.clients_log_in === true,
    stages: stages.slice(0, 8),
    job_types: job_types.slice(0, 12),
    fields: fields.slice(0, 25),
  };
}

// JSON schema Claude fills in. Lengths are enforced by normalizeSetup, not the schema.
export const SETUP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["base", "workspace_name", "clients_log_in", "stages", "job_types", "fields"],
  properties: {
    base: { type: "string", enum: [...PROFILE_KEYS], description: "The closest stock profile" },
    workspace_name: { type: "string", description: "A short name for their workspace, e.g. their business name" },
    clients_log_in: { type: "boolean", description: "True only if their clients would log in themselves to send requests" },
    stages: {
      type: "array",
      description: "3 to 7 stages a job moves through, in order. The last one means finished.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "color"],
        properties: { label: { type: "string" }, color: { type: "string", enum: [...STAGE_COLORS] } },
      },
    },
    job_types: {
      type: "array",
      description: "3 to 8 kinds of job, ending with Other. lead_days is the working days each usually needs.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "lead_days"],
        properties: { name: { type: "string" }, lead_days: { type: "integer" } },
      },
    },
    fields: {
      type: "array",
      description: "The questions a new job asks, in order, 4 to 12 of them.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["use", "label", "kind", "hint", "options", "required"],
        properties: {
          use: { type: "string", enum: [...BUILTIN_KEYS, "custom"] },
          label: { type: "string" },
          kind: { type: "string", enum: [...ADDABLE_KINDS] },
          hint: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          required: { type: "boolean" },
        },
      },
    },
  },
} as const;
