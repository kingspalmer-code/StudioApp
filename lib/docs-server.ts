import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanItems, CUSTOM_FONT, DEFAULT_SETTINGS, FONTS, type Doc, type DocSettings } from "./documents";
import { renderDocPdf } from "./pdf";

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
