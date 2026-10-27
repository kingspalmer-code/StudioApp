import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanItems, CUSTOM_FONT, DEFAULT_MESSAGES, DEFAULT_SETTINGS, FONTS, type Doc, type DocKind, type DocSettings } from "./documents";
import { itemsOf, valueOf, type JobField } from "./fields";
import { renderDocPdf } from "./pdf";
import type { Ticket } from "./types";

// Server-side helpers for quotes and invoices. Every read goes through the signed-in person's
// Supabase client, so the database decides what they're allowed to see.

export async function loadSettings(supabase: SupabaseClient, workspaceId: string): Promise<DocSettings> {
  const { data } = await supabase.from("doc_settings").select("*").eq("workspace_id", workspaceId).maybeSingle<DocSettings>();
  return { ...DEFAULT_SETTINGS, workspace_id: workspaceId, ...(data ?? {}), vat_rate: Number(data?.vat_rate ?? DEFAULT_SETTINGS.vat_rate) };
}

// The settings form, cleaned up. Used to save it, and to preview changes before they're saved.
export function readSettingsForm(f: FormData) {
  const str = (k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
  const num = (k: string, d: number, max: number) => {
    const n = Math.round(Number(f.get(k)));
    return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : d;
  };
  // Left as Oatcake's own wording, a message saves empty, so it follows any change to the default.
  const message = (k: DocKind) => {
    const v = String(f.get(`${k}_message`) ?? "").replace(/\r\n/g, "\n").trim().slice(0, 2000);
    return v === DEFAULT_MESSAGES[k] ? "" : v;
  };
  const font = str("font", 20);
  const accent = str("accent", 7);
  return {
    business_name: str("business_name", 120),
    address: str("address", 400),
    email: str("email", 200).toLowerCase(),
    phone: str("phone", 60),
    website: str("website", 200),
    vat_registered: f.get("vat_registered") === "on",
    vat_number: str("vat_number", 40),
    vat_rate: Math.max(0, Math.min(100, Number(f.get("vat_rate")) || 20)),
    bank_details: str("bank_details", 600),
    payment_days: num("payment_days", 14, 365),
    quote_days: num("quote_days", 30, 365),
    footer: str("footer", 200),
    font: font === CUSTOM_FONT || FONTS.some((x) => x.key === font) ? font : "helvetica",
    accent: /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#382a25",
    next_invoice: Math.max(1, num("next_invoice", 1, 9999999)),
    next_quote: Math.max(1, num("next_quote", 1, 9999999)),
    quote_message: message("quote"),
    invoice_message: message("invoice"),
  };
}

export function asDoc(row: Record<string, unknown>): Doc {
  const r = row as unknown as Doc;
  return {
    ...r,
    items: cleanItems(r.items),
    vat_rate: r.vat_rate == null ? null : Number(r.vat_rate),
    subtotal: Number(r.subtotal),
    vat: Number(r.vat),
    total: Number(r.total),
  };
}

async function signed(supabase: SupabaseClient, path: string) {
  if (!path) return null;
  const { data } = await supabase.storage.from("brand").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export async function pdfFor(supabase: SupabaseClient, doc: Doc, settings: DocSettings, origin: string) {
  const [logoUrl, customFontUrl] = await Promise.all([
    signed(supabase, settings.logo_path),
    settings.font === "custom" ? signed(supabase, settings.font_path) : Promise.resolve(null),
  ]);
  return renderDocPdf({ doc, settings, origin, logoUrl, customFontUrl });
}

// What a PDF link shows if the PDF can't be made, instead of a blank page.
export function pdfFailed(e: unknown) {
  console.error("pdf", e);
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width"><body style="font:16px -apple-system,Helvetica,sans-serif;padding:32px;color:#2a201c"><h1 style="font-size:20px">The PDF couldn't be made</h1><p>Something went wrong on our side. Go back and try again in a moment.</p></body>`,
    { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// A made-up quote for previewing the look in Settings.
export function sampleDoc(settings: DocSettings): Doc {
  return asDoc({
    id: 0,
    workspace_id: settings.workspace_id,
    ticket_id: null,
    kind: "quote",
    number: 1,
    customer_name: "Copper Kettle Café",
    customer_email: "hello@copperkettle.example",
    customer_address: "12 Market Street",
    title: "Autumn menu launch",
    items: [
      { description: "Poster design, A2 and A3", qty: 1, unit_price: 180 },
      { description: "Social media set: square, story and banner", qty: 3, unit_price: 45 },
      { description: "Print-ready files and one round of changes", qty: 1, unit_price: 0 },
    ],
    notes: "Includes two rounds of changes. Printing can be arranged at cost.",
    issued_on: new Date().toISOString().slice(0, 10),
    due_on: null,
    vat_rate: settings.vat_registered ? settings.vat_rate : null,
    subtotal: 315,
    vat: settings.vat_registered ? Math.round(315 * settings.vat_rate) / 100 : 0,
    total: settings.vat_registered ? 315 + Math.round(315 * settings.vat_rate) / 100 : 315,
    status: "draft",
    sent_at: null,
    sent_to: "",
  });
}

// What a quote or invoice made from a job starts with: who it's for, where it goes and what's on it.
// Email: an Email field filled in on the job itself, else the customer's email (the Email under
// Customer at the top of the job form saves onto the customer). Address: the customer's, else the
// first address on the job. Lines: an invoice follows the accepted quote; otherwise the lines an
// amount on the job was broken into, then the latest quote, then the quoted amount as one line.
export async function jobDefaults(supabase: SupabaseClient, ticketId: number, kind: DocKind) {
  const [{ data: t }, { data: fields }, { data: quotes }] = await Promise.all([
    supabase.from("tickets").select("*").eq("id", ticketId).maybeSingle<Ticket>(),
    supabase.from("job_fields").select("*").in("kind", ["email", "address", "money"]).order("position").returns<JobField[]>(),
    supabase.from("documents").select("items, status").eq("ticket_id", ticketId).eq("kind", "quote").order("created_at", { ascending: false }),
  ]);
  if (!t) return null;
  const { data: biz } = await supabase.from("businesses").select("name, email, address").eq("id", t.business_id).maybeSingle<{ name: string; email: string | null; address: string | null }>();
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const isEmail = (v: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(v));
  const of = (k: JobField["kind"]) => (fields ?? []).filter((f) => f.kind === k).map((f) => valueOf(t, f));
  const email = [...of("email"), biz?.email].find(isEmail);
  const address = [biz?.address, ...of("address"), t.site_address].map(text).find(Boolean) ?? "";
  // The person who asked, if there is one, alongside the customer: "Dylan Stott, The Brewery Tap".
  const who = text(t.requester_name);
  const name = text(biz?.name);
  const customer = who && !name.toLowerCase().includes(who.toLowerCase()) ? [who, name].filter(Boolean).join(", ") : name;

  const money = [{ key: "quote_amount" }, ...(fields ?? []).filter((f) => f.kind === "money" && f.key !== "quote_amount")];
  const fromJob = money.map((f) => itemsOf(t, f.key)).find((x) => x.length) ?? [];
  const accepted = quotes?.find((q) => q.status === "accepted");
  const latest = quotes?.map((q) => cleanItems(q.items)).find((x) => x.some((i) => i.unit_price));
  let items = kind === "invoice" && accepted ? cleanItems(accepted.items) : [];
  if (!items.length) items = fromJob;
  if (!items.length && kind === "invoice" && latest) items = latest;
  if (!items.length) items = [{ description: t.title, qty: 1, unit_price: Number(t.quote_amount ?? 0) }];

  return {
    customer_name: customer.slice(0, 120),
    customer_email: email ? text(email).toLowerCase() : "",
    customer_address: address.slice(0, 400),
    title: t.title,
    items,
  };
}
