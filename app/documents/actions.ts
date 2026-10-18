"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { addDays, cleanItems, CUSTOM_FONT, docName, gbp, KIND_LABEL, type DocKind, type LineItem } from "@/lib/documents";
import { asDoc, loadSettings, pdfFor, readSettingsForm } from "@/lib/docs-server";
import { itemsKey, itemsOf } from "@/lib/fields";
import { requireEditor } from "@/lib/session";
import type { Ticket } from "@/lib/types";

const owner = () => requireEditor(["designer"], "quotes");
const today = () => new Date().toISOString().slice(0, 10);

// Settings → Quotes & invoices ---------------------------------------------------------------
export async function saveDocSettings(formData: FormData) {
  const { supabase, workspace } = await owner();
  const { error } = await supabase
    .from("doc_settings")
    .upsert({ workspace_id: workspace.id, ...readSettingsForm(formData), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/documents");
}

// Called after the browser uploads a logo or font to the brand bucket.
export async function setBrandFile(kind: "logo" | "font", path: string) {
  const { supabase, workspace } = await owner();
  if (path && !path.startsWith(`${workspace.id}/`)) throw new Error("That file isn't in your workspace");
  const column = kind === "logo" ? "logo_path" : "font_path";
  const settings = await loadSettings(supabase, workspace.id);
  const old = settings[column];
  const { error } = await supabase
    .from("doc_settings")
    .upsert({ ...settings, [column]: path, ...(kind === "font" ? { font: path ? CUSTOM_FONT : "helvetica" } : {}), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  if (old && old !== path) await supabase.storage.from("brand").remove([old]);
  revalidatePath("/settings/documents");
}

// Making and editing documents -----------------------------------------------------------------
export async function createDocument(ticketId: number, kind: DocKind) {
  const { supabase, workspace, businesses } = await owner();
  const { data: t } = await supabase.from("tickets").select("*").eq("id", ticketId).maybeSingle<Ticket>();
  if (!t) throw new Error("Job not found");
  const settings = await loadSettings(supabase, workspace.id);
  const biz = businesses.find((b) => b.id === t.business_id);

  // An invoice starts from the job's quote, if there is one; otherwise from the quoted amount.
  let items: LineItem[] = [];
  let notes = "";
  if (kind === "invoice") {
    const { data: quotes } = await supabase
      .from("documents")
      .select("items, notes, status")
      .eq("ticket_id", ticketId)
      .eq("kind", "quote")
      .order("created_at", { ascending: false });
    const best = quotes?.find((q) => q.status === "accepted") ?? quotes?.[0];
    if (best) {
      items = cleanItems(best.items);
      notes = "";
    }
  }
  // Otherwise from the lines the job's quote was broken into, or the quoted amount as one line.
  if (!items.length) items = itemsOf(t, "quote_amount");
  if (!items.length) items = [{ description: t.title, qty: 1, unit_price: Number(t.quote_amount ?? 0) }];

  const issued = today();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      workspace_id: workspace.id,
      ticket_id: ticketId,
      kind,
      customer_name: biz?.name ?? "",
      customer_email: biz?.email ?? "",
      customer_address: biz?.address || t.site_address || "",
      title: t.title,
      items,
      notes,
      issued_on: issued,
      due_on: addDays(issued, kind === "quote" ? settings.quote_days : settings.payment_days),
      vat_rate: settings.vat_registered ? settings.vat_rate : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/documents/${data.id}`);
}

export type DocDraft = {
  customer_name: string;
  customer_email: string;
  customer_address: string;
  title: string;
  items: LineItem[];
  notes: string;
  issued_on: string;
  due_on: string | null;
  vat: boolean;
};

export async function saveDocument(id: number, d: DocDraft) {
  const { supabase, workspace } = await owner();
  const settings = await loadSettings(supabase, workspace.id);
  const date = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const { error } = await supabase
    .from("documents")
    .update({
      customer_name: d.customer_name.trim().slice(0, 120),
      customer_email: d.customer_email.trim().toLowerCase().slice(0, 200),
      customer_address: d.customer_address.trim().slice(0, 400),
      title: d.title.trim().slice(0, 160),
      items: cleanItems(d.items),
      notes: d.notes.trim().slice(0, 1500),
      issued_on: date(d.issued_on) ?? today(),
      due_on: date(d.due_on),
      vat_rate: d.vat ? settings.vat_rate : null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/documents/${id}`);
  return { ok: true };
}

export async function deleteDocument(id: number) {
  const { supabase } = await owner();
  const { data } = await supabase.from("documents").select("ticket_id").eq("id", id).maybeSingle();
  await supabase.from("documents").delete().eq("id", id);
  redirect(data?.ticket_id ? `/tickets/${data.ticket_id}` : "/queue");
}

// Accepted quotes set the job's quote; paid invoices fill in what's been paid.
export async function setDocStatus(id: number, status: "draft" | "sent" | "accepted" | "paid") {
  const { supabase } = await owner();
  const { data: row, error } = await supabase.from("documents").update({ status }).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  const doc = asDoc(row);
  if (doc.ticket_id && status === "accepted" && doc.kind === "quote") {
    // Without VAT the lines add up to the total, so the job's quote takes the accepted quote's lines
    // too; with VAT they wouldn't, so any old breakdown goes and the job keeps just the amount.
    const { data: t } = await supabase.from("tickets").select("details").eq("id", doc.ticket_id).maybeSingle<{ details: Record<string, unknown> | null }>();
    const details = { ...(t?.details ?? {}) };
    if (doc.vat_rate == null) details[itemsKey("quote_amount")] = doc.items;
    else delete details[itemsKey("quote_amount")];
    await supabase.from("tickets").update({ quote_amount: doc.total, details }).eq("id", doc.ticket_id);
  }
  if (doc.ticket_id && status === "paid" && doc.kind === "invoice") {
    await supabase.from("tickets").update({ paid_amount: doc.total }).eq("id", doc.ticket_id);
  }
  revalidatePath(`/documents/${id}`);
  if (doc.ticket_id) revalidatePath(`/tickets/${doc.ticket_id}`);
}

// AI drafting ------------------------------------------------------------------------------------
const ITEMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "notes"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "qty", "unit_price"],
        properties: { description: { type: "string" }, qty: { type: "number" }, unit_price: { type: "number" } },
      },
    },
    notes: { type: "string" },
  },
} as const;

export async function draftItems(id: number, extra: string): Promise<{ items?: LineItem[]; notes?: string; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Drafting isn't switched on yet." };
  const { supabase, workspace } = await owner();
  const { data: row } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
  if (!row) return { error: "Not found" };
  const doc = asDoc(row);
  const [{ data: t }, { data: past }] = await Promise.all([
    doc.ticket_id ? supabase.from("tickets").select("*").eq("id", doc.ticket_id).maybeSingle<Ticket>() : Promise.resolve({ data: null }),
    supabase.from("documents").select("title, items").neq("id", id).order("created_at", { ascending: false }).limit(8),
  ]);
  const { error: limit } = await supabase.rpc("note_ai_use", { what: `draft ${doc.kind}` });
  if (limit) return { error: limit.message };

  const job = t
    ? [
        `Job: ${t.title}`,
        `Type: ${t.type}`,
        t.formats && `Sizes / deliverables: ${t.formats}`,
        t.brief && `Brief: ${t.brief}`,
        t.copy && `Wording: ${t.copy}`,
        t.site_address && `Site: ${t.site_address}`,
        t.quote_amount != null && `Amount already agreed or quoted: ${gbp(Number(t.quote_amount))}`,
        ...Object.entries(t.details ?? {}).map(([k, v]) => `${k.replace(/^f_/, "").replace(/_/g, " ")}: ${String(v)}`),
      ]
        .filter(Boolean)
        .join("\n")
    : `Title: ${doc.title}`;
  const history = (past ?? [])
    .map((p) => `${p.title}: ${cleanItems(p.items).map((i) => `${i.description} ${i.qty} × £${i.unit_price}`).join("; ")}`)
    .join("\n");

  try {
    const response = await new Anthropic().messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      system: `You draft line items for a ${KIND_LABEL[doc.kind].toLowerCase()} from ${workspace.name}, a small UK business, using its own Oatcake job details.
Write 2 to 8 clear line items a customer would understand, in UK English, splitting the work into sensible parts (for example design, materials, making, fitting). Use realistic UK prices in pounds, without VAT.
If an agreed amount is given, make the items add up to it exactly. Base prices on the business's past items when they're relevant. Use qty for countable things and 1 otherwise.
notes: one or two short sentences for the bottom of the ${KIND_LABEL[doc.kind].toLowerCase()}, such as what's included, or an empty string.`,
      output_config: { effort: "low", format: { type: "json_schema", schema: ITEMS_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `${job}${history ? `\n\nPast quotes and invoices from this business:\n${history}` : ""}${extra.trim() ? `\n\nAlso: ${extra.trim().slice(0, 500)}` : ""}`,
        },
      ],
    });
    const text = response.content.find((b) => b.type === "text")?.text;
    const out = text ? JSON.parse(text) : null;
    const items = cleanItems(out?.items);
    if (!items.length) return { error: "That didn't come out right. Try again, or fill it in yourself." };
    return { items, notes: String(out?.notes ?? "").slice(0, 1500) };
  } catch (e) {
    console.error("draftItems", e);
    return { error: "Oatcake couldn't draft this just now. Try again, or fill it in yourself." };
  }
}

// Emailing ---------------------------------------------------------------------------------------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendDocument(id: number, to: string, message: string): Promise<{ ok?: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { error: "Emailing isn't switched on yet. Download the PDF and send it yourself for now." };
  const { supabase, workspace, member } = await owner();
  const address = to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { error: "Check the email address." };

  const { data: row } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
  if (!row) return { error: "Not found" };
  const doc = asDoc(row);
  const settings = await loadSettings(supabase, workspace.id);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  let pdf: Buffer;
  try {
    pdf = await pdfFor(supabase, doc, settings, origin);
  } catch (e) {
    console.error("sendDocument pdf", e);
    return { error: "The PDF couldn't be made, so nothing was sent. Try again in a moment." };
  }

  const from = (settings.business_name || workspace.name).replace(/[<>"]/g, "");
  const replyTo = settings.email || member.email;
  const name = docName(doc);
  const body = message.trim() || `Please find ${doc.kind === "quote" ? "your quote" : "your invoice"} attached.`;
  const html = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#2a201c;max-width:520px">
${esc(body).replace(/\n/g, "<br>")}
<p style="margin:22px 0 4px;color:#6b5d55;font-size:13px">${esc(name)}${doc.title ? ` · ${esc(doc.title)}` : ""}</p>
<p style="margin:0;font-size:20px;font-weight:700;color:${settings.accent}">${esc(gbp(doc.total))}</p>
<p style="margin:22px 0 0;color:#6b5d55;font-size:13px">${esc(from)}${replyTo ? ` · Reply to this email to get in touch` : ""}</p>
</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${from} via Oatcake <documents@oatcake.xyz>`,
      to: [address],
      reply_to: replyTo || undefined,
      subject: `${name} from ${from}`,
      html,
      text: `${body}\n\n${name}${doc.title ? ` · ${doc.title}` : ""}\n${gbp(doc.total)}\n\n${from}`,
      attachments: [{ filename: `${name}.pdf`, content: Buffer.from(pdf).toString("base64") }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("sendDocument", res.status, detail);
    return { error: `The email didn't send (${res.status}). Try again, or download the PDF and send it yourself.` };
  }
  await supabase
    .from("documents")
    .update({ status: doc.status === "draft" ? "sent" : doc.status, sent_at: new Date().toISOString(), sent_to: address })
    .eq("id", id);
  if (doc.ticket_id && doc.kind === "quote") {
    await supabase.from("tickets").update({ quote_amount: doc.total }).eq("id", doc.ticket_id).is("quote_amount", null);
  }
  revalidatePath(`/documents/${id}`);
  return { ok: true };
}
