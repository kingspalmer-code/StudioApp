// The fields at the top of every new job form. They're stored in their own ticket columns, so they
// aren't rows in job_fields, but each workspace can rename them, change their hint, reorder them
// and hide the ones a job can do without. Saved on workspaces.core_fields.
export type CoreKey = "customer" | "contact" | "phone" | "email" | "address" | "title" | "type" | "deadline" | "priority";

// The customer's contact details the top of the form can ask for. Each saves onto the customer,
// in the businesses column of the same name, so they show on Customers and the job page too.
export const CONTACT_KEYS = ["phone", "email", "address"] as const;
export type ContactKey = (typeof CONTACT_KEYS)[number];
export const isContact = (k: string): k is ContactKey => (CONTACT_KEYS as readonly string[]).includes(k);

// The person to deal with at the customer, saved on the job (tickets.requester_name), so each job
// can have its own. Quote and invoice emails are addressed to them.
// When it's on the form it stands in for the Requested by field, which saves to the same place.
export const contactOn = (core: CoreField[]) => core.some((c) => c.key === "contact" && !c.hidden);

export type CoreSettings = {
  order?: CoreKey[];
  fields?: Partial<Record<CoreKey, { label?: string; hint?: string; hidden?: boolean }>>;
};

export type CoreField = {
  key: CoreKey;
  label: string;
  hint: string;
  hidden: boolean;
  // The contact details, needed by and importance have fallbacks (left blank, no date, Standard); the rest every job needs.
  canHide: boolean;
  // Dropdowns and dates have no empty-box hint.
  hasHint: boolean;
  defaultLabel: string;
};

// Contact person, email and address start switched off, so forms look as they did before they were added.
const DEFAULTS: { key: CoreKey; label: string; canHide: boolean; hasHint: boolean; customers?: boolean; off?: boolean }[] = [
  { key: "customer", label: "Customer", canHide: false, hasHint: true, customers: true },
  { key: "contact", label: "Contact person", canHide: true, hasHint: true, customers: true, off: true },
  { key: "phone", label: "Phone", canHide: true, hasHint: true, customers: true },
  { key: "email", label: "Email", canHide: true, hasHint: true, customers: true, off: true },
  { key: "address", label: "Address", canHide: true, hasHint: true, customers: true, off: true },
  { key: "title", label: "Title", canHide: false, hasHint: true },
  { key: "type", label: "Type", canHide: false, hasHint: false },
  { key: "deadline", label: "Needed by", canHide: true, hasHint: false },
  { key: "priority", label: "Importance", canHide: true, hasHint: false },
];

export const CORE_KEYS = DEFAULTS.map((d) => d.key);

const defaultHint = (key: CoreKey, mode: { trade: boolean; solo: boolean }) =>
  key === "customer"
    ? "Existing or new customer"
    : key === "contact"
      ? "Who quotes and invoices are addressed to"
      : isContact(key)
      ? "For new customers"
      : key === "title"
        ? mode.solo ? "e.g. Portfolio site refresh" : mode.trade ? "e.g. Shop front fascia" : "e.g. Halloween weekend poster"
        : "";

export function readCore(raw: unknown): CoreSettings {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as CoreSettings;
  const order = Array.isArray(r.order) ? r.order.filter((k): k is CoreKey => CORE_KEYS.includes(k)) : undefined;
  return { order, fields: r.fields && typeof r.fields === "object" ? r.fields : {} };
}

// The core fields this workspace's form shows, in order. Customer and contact details only for Customers workspaces.
export function coreFields(raw: unknown, mode: { trade: boolean; solo: boolean }): CoreField[] {
  const s = readCore(raw);
  // Fields added since the order was saved slot in after the field they follow by default.
  const order = [...(s.order ?? [])];
  CORE_KEYS.forEach((k, i) => {
    if (order.includes(k)) return;
    const after = i > 0 ? order.indexOf(CORE_KEYS[i - 1]) : -1;
    order.splice(after + 1, 0, k);
  });
  return order
    .map((key) => DEFAULTS.find((d) => d.key === key)!)
    .filter((d) => !d.customers || (mode.trade && !mode.solo))
    .map((d) => {
      const own = s.fields?.[d.key] ?? {};
      const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      return {
        key: d.key,
        label: str(own.label) || d.label,
        hint: d.hasHint ? str(own.hint) || defaultHint(d.key, mode) : "",
        hidden: d.canHide && (typeof own.hidden === "boolean" ? own.hidden : d.off === true),
        canHide: d.canHide,
        hasHint: d.hasHint,
        defaultLabel: d.label,
      };
    });
}

// A workspace that hid Needed by works without dates: jobs save without one and nothing shows or
// sorts by a due date. Dates already saved stay put, so showing it again brings them back.
export const datesOff = (raw: unknown) => coreFields(raw, { trade: false, solo: false }).some((f) => f.key === "deadline" && f.hidden);
