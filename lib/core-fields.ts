// The fields at the top of every new job form. They're stored in their own ticket columns, so they
// aren't rows in job_fields, but each workspace can rename them, change their hint, reorder them
// and hide the ones a job can do without. Saved on workspaces.core_fields.
export type CoreKey = "customer" | "phone" | "title" | "type" | "deadline" | "priority";

export type CoreSettings = {
  order?: CoreKey[];
  fields?: Partial<Record<CoreKey, { label?: string; hint?: string; hidden?: boolean }>>;
};

export type CoreField = {
  key: CoreKey;
  label: string;
  hint: string;
  hidden: boolean;
  // Phone and importance have fallbacks (no phone, Standard); the rest every job needs.
  canHide: boolean;
  // Dropdowns and dates have no empty-box hint.
  hasHint: boolean;
  defaultLabel: string;
};

const DEFAULTS: { key: CoreKey; label: string; canHide: boolean; hasHint: boolean; customers?: boolean }[] = [
  { key: "customer", label: "Customer", canHide: false, hasHint: true, customers: true },
  { key: "phone", label: "Phone", canHide: true, hasHint: true, customers: true },
  { key: "title", label: "Title", canHide: false, hasHint: true },
  { key: "type", label: "Type", canHide: false, hasHint: false },
  { key: "deadline", label: "Needed by", canHide: false, hasHint: false },
  { key: "priority", label: "Importance", canHide: true, hasHint: false },
];

export const CORE_KEYS = DEFAULTS.map((d) => d.key);

const defaultHint = (key: CoreKey, mode: { trade: boolean; solo: boolean }) =>
  key === "customer"
    ? "Existing or new customer"
    : key === "phone"
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

// The core fields this workspace's form shows, in order. Customer and phone only for Customers workspaces.
export function coreFields(raw: unknown, mode: { trade: boolean; solo: boolean }): CoreField[] {
  const s = readCore(raw);
  const order = [...(s.order ?? []), ...CORE_KEYS.filter((k) => !s.order?.includes(k))];
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
        hidden: d.canHide && own.hidden === true,
        canHide: d.canHide,
        hasHint: d.hasHint,
        defaultLabel: d.label,
      };
    });
}
