import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanItems, DEFAULT_SETTINGS, type Doc, type DocSettings } from "./documents";
import { renderDocPdf } from "./pdf";

// Server-side helpers for quotes and invoices. Every read goes through the signed-in person's
// Supabase client, so the database decides what they're allowed to see.

export async function loadSettings(supabase: SupabaseClient, workspaceId: string): Promise<DocSettings> {
  const { data } = await supabase.from("doc_settings").select("*").eq("workspace_id", workspaceId).maybeSingle<DocSettings>();
  return { ...DEFAULT_SETTINGS, workspace_id: workspaceId, ...(data ?? {}), vat_rate: Number(data?.vat_rate ?? DEFAULT_SETTINGS.vat_rate) };
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

// A made-up quote for previewing the look in Settings.
export function sampleDoc(settings: DocSettings): Doc {
  return asDoc({
    id: 0,
    workspace_id: settings.workspace_id,
    ticket_id: null,
    kind: "quote",
    number: 1,
    customer_name: "The Brewery Tap",
    customer_email: "hello@brewerytap.co.uk",
    customer_address: "12 Market Street, Leek",
    title: "Autumn beer festival",
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
