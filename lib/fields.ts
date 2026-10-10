import type { Ticket } from "./types";

// What a new job asks for. Each workspace edits its own list in Settings → Job form.
export type FieldKind =
  | "heading"
  | "text"
  | "longtext"
  | "number"
  | "money"
  | "date"
  | "select"
  | "checkbox"
  | "link"
  | "address"
  | "phone"
  | "email"
  | "files";

export type JobField = {
  id: number;
  key: string;
  label: string;
  kind: FieldKind;
  hint: string;
  options: string[];
  required: boolean;
  hidden: boolean;
  on_form: boolean;
  type_ids: number[];
  builtin: boolean;
  position: number;
};

export const KIND_LABELS: Record<FieldKind, string> = {
  text: "Short text",
  longtext: "Long text",
  number: "Number",
  money: "Amount (£)",
  date: "Date",
  select: "Dropdown",
  checkbox: "Tick box",
  link: "Link",
  address: "Address",
  phone: "Phone",
  email: "Email",
  heading: "Section heading",
  files: "Photos / files",
};

// Kinds someone can add. Uploads go through the one built-in files field.
export const ADDABLE_KINDS: FieldKind[] = ["text", "longtext", "number", "money", "date", "select", "checkbox", "link", "address", "phone", "email", "heading"];

// Built-in fields are stored in their own ticket columns; everything else lives in tickets.details.
const COLUMNS = new Set(["formats", "brief", "copy", "links", "colours", "event_date", "requester_name", "approver", "site_address", "quote_amount", "paid_amount"]);
const NUMERIC_COLUMNS = new Set(["quote_amount", "paid_amount"]);

export const appliesTo = (f: JobField, typeId: number | undefined) => !f.type_ids?.length || (typeId != null && f.type_ids.includes(typeId));

export function valueOf(t: Ticket, f: JobField): unknown {
  if (f.kind === "heading" || f.kind === "files") return null;
  if (f.builtin && COLUMNS.has(f.key)) return (t as unknown as Record<string, unknown>)[f.key];
  return t.details?.[f.key];
}

export const hasValue = (v: unknown) => v !== null && v !== undefined && v !== "" && v !== false;

const parseAmount = (s: string) => {
  const n = parseFloat(s.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

// Turns submitted form values into ticket columns plus the details object.
export function readFields(fields: JobField[], get: (key: string) => string, has: (key: string) => boolean, existing: Record<string, unknown> = {}) {
  const columns: Record<string, unknown> = {};
  const details: Record<string, unknown> = { ...existing };
  for (const f of fields) {
    if (f.kind === "heading" || f.kind === "files") continue;
    let v: unknown;
    if (f.kind === "checkbox") v = has(f.key);
    else {
      const raw = get(f.key);
      if (f.kind === "money" || f.kind === "number") v = raw ? parseAmount(raw) : null;
      else if (f.kind === "date") v = raw || null;
      else v = raw;
    }
    if (f.builtin && COLUMNS.has(f.key)) {
      columns[f.key] = NUMERIC_COLUMNS.has(f.key) || f.key === "event_date" ? (v === "" ? null : v) : (v ?? "");
    } else if (hasValue(v) || v === 0) details[f.key] = v;
    else delete details[f.key];
  }
  return { columns, details };
}

export function showValue(f: JobField, v: unknown): string {
  if (!hasValue(v)) return "";
  if (f.kind === "checkbox") return "Yes";
  if (f.kind === "money") return `£${Number(v).toLocaleString("en-GB", { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  if (f.kind === "date") return new Date(`${v}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return String(v);
}

// Splits a field list into titled groups at each section heading.
export function groupFields(fields: JobField[]) {
  const groups: { title: string | null; fields: JobField[] }[] = [{ title: null, fields: [] }];
  for (const f of fields) {
    if (f.kind === "heading") groups.push({ title: f.label, fields: [] });
    else groups[groups.length - 1].fields.push(f);
  }
  return groups.filter((g) => g.fields.length > 0);
}
