// Quotes and invoices: the shapes shared by the editor, the PDF and the email.

export type DocKind = "quote" | "invoice";
export type DocStatus = "draft" | "sent" | "accepted" | "paid";
export type LineItem = { description: string; qty: number; unit_price: number };

export type DocSettings = {
  workspace_id: string;
  business_name: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  vat_registered: boolean;
  vat_number: string;
  vat_rate: number;
  bank_details: string;
  payment_days: number;
  quote_days: number;
  footer: string;
  font: string;
  font_path: string;
  accent: string;
  logo_path: string;
};

export type Doc = {
  id: number;
  workspace_id: string;
  ticket_id: number | null;
  kind: DocKind;
  number: number;
  customer_name: string;
  customer_email: string;
  customer_address: string;
  title: string;
  items: LineItem[];
  notes: string;
  issued_on: string;
  due_on: string | null;
  vat_rate: number | null;
  subtotal: number;
  vat: number;
  total: number;
  status: DocStatus;
  sent_at: string | null;
  sent_to: string;
};

// Heading fonts for the PDF. Body text is always Helvetica so it stays easy to read.
// Files live in public/pdf-fonts (all SIL Open Font Licence); built-ins need no file.
export const FONTS = [
  { key: "helvetica", label: "Clean", family: "Helvetica-Bold", file: null, css: "Helvetica, Arial, sans-serif" },
  { key: "inter", label: "Modern", family: "Inter", file: "inter-700.woff", css: "Inter, system-ui, sans-serif" },
  { key: "grotesk", label: "Studio", family: "Space Grotesk", file: "space-grotesk-700.woff", css: "'Space Grotesk', system-ui, sans-serif" },
  { key: "archivo", label: "Bold", family: "Archivo Black", file: "archivo-black-400.woff", css: "'Archivo Black', Impact, sans-serif" },
  { key: "playfair", label: "Elegant", family: "Playfair Display", file: "playfair-display-700.woff", css: "'Playfair Display', Georgia, serif" },
  { key: "dmserif", label: "Classic", family: "DM Serif Display", file: "dm-serif-display-400.woff", css: "'DM Serif Display', Georgia, serif" },
  { key: "times", label: "Traditional", family: "Times-Bold", file: null, css: "'Times New Roman', Times, serif" },
] as const;
export const CUSTOM_FONT = "custom";

export const DEFAULT_SETTINGS: Omit<DocSettings, "workspace_id"> = {
  business_name: "",
  address: "",
  email: "",
  phone: "",
  website: "",
  vat_registered: false,
  vat_number: "",
  vat_rate: 20,
  bank_details: "",
  payment_days: 14,
  quote_days: 30,
  footer: "",
  font: "helvetica",
  font_path: "",
  accent: "#382a25",
  logo_path: "",
};

export const KIND_LABEL: Record<DocKind, string> = { quote: "Quote", invoice: "Invoice" };
export const STATUS_LABEL: Record<DocStatus, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", paid: "Paid" };

export const docNumber = (d: Pick<Doc, "kind" | "number">) => `${d.kind === "quote" ? "Q" : "INV"}-${String(d.number).padStart(4, "0")}`;
export const docName = (d: Pick<Doc, "kind" | "number">) => `${KIND_LABEL[d.kind]} ${docNumber(d)}`;

export const gbp = (n: number) => n.toLocaleString("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function totals(items: LineItem[], vatRate: number | null) {
  const subtotal = round2(items.reduce((s, i) => s + round2((Number(i.qty) || 0) * (Number(i.unit_price) || 0)), 0));
  const vat = vatRate == null ? 0 : round2((subtotal * vatRate) / 100);
  return { subtotal, vat, total: round2(subtotal + vat) };
}

export function cleanItems(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i) => ({
      description: String(i?.description ?? "").trim().slice(0, 300),
      qty: Math.max(0, Math.min(100000, Number(i?.qty) || 0)),
      unit_price: Math.max(-1000000, Math.min(1000000, round2(Number(i?.unit_price) || 0))),
    }))
    .filter((i) => i.description || i.unit_price)
    .slice(0, 40);
}

export const longDate = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
