"use server";

import { docName, gbp, STATUS_LABEL } from "@/lib/documents";
import { asDoc } from "@/lib/docs-server";
import { fileSize, isImage, signDeliveries, type Delivery } from "@/lib/deliveries";
import { groupFields, hasValue, showValue, valueOf, type JobField } from "@/lib/fields";
import type { JobFile } from "@/lib/filing";
import { fmtMinutes, TIME_COLUMNS, totalMinutes, type TimeLog } from "@/lib/hours";
import { formatDate, isDone, statusLabel } from "@/lib/priority";
import { asClient, requireMember } from "@/lib/session";
import { signedUrls } from "@/lib/signed";
import type { Note, Ticket, TicketFile } from "@/lib/types";

const year = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: process.env.NEXT_PUBLIC_TIMEZONE || "Europe/London" });

// Everything filed with one finished job, for the file it opens into in the drawer. Read-only, and
// the database decides what each login may see, as on the job's own page.
export async function openFile(id: number): Promise<JobFile | null> {
  const session = await requireMember(["manager", "designer", "client"], "requests");
  const { supabase } = session;
  const [{ data: t }, { data: fields }, { data: notes }, { data: refs }, { data: delivered }, { data: docRows }, { data: logs }] = await Promise.all([
    supabase.from("tickets").select("*").eq("id", id).maybeSingle<Ticket>(),
    supabase.from("job_fields").select("*").order("position").order("id").returns<JobField[]>(),
    supabase.from("ticket_notes").select("*").eq("ticket_id", id).is("draft_id", null).order("created_at").returns<Note[]>(),
    supabase.from("ticket_files").select("*").eq("ticket_id", id).order("created_at").returns<TicketFile[]>(),
    supabase.from("ticket_deliveries").select("*").eq("ticket_id", id).order("created_at").returns<Delivery[]>(),
    supabase.from("documents").select("*").eq("ticket_id", id).order("created_at"),
    supabase.from("time_logs").select(TIME_COLUMNS).eq("ticket_id", id).eq("gone", false).returns<TimeLog[]>(),
  ]);
  if (!t) return null;
  const { member, businesses, ctx } = asClient(session, t.business_id);
  if (!isDone(t, ctx)) return null;

  const [signed, refUrls] = await Promise.all([
    signDeliveries(supabase, delivered ?? []),
    refs?.length ? signedUrls(supabase, "inspiration", refs.map((f) => f.path)) : Promise.resolve({} as Record<string, string>),
  ]);
  const withValues = (fields ?? []).filter((f) => f.kind === "heading" || hasValue(valueOf(t, f)));
  const minutes = totalMinutes(logs ?? []);
  // Quotes and invoices show to the studio, as on the job's page.
  const docs = member.role === "designer" ? (docRows ?? []).map(asDoc) : [];

  return {
    id: t.id,
    title: t.title,
    type: t.type,
    biz: businesses.find((b) => b.id === t.business_id)?.name ?? "",
    status: statusLabel(ctx, t.status),
    started: year(t.created_at),
    finished: year(t.delivered_at ?? t.deadline ?? t.updated_at),
    details: groupFields(withValues).map((g) => ({
      title: g.title,
      rows: g.fields.map((f) => ({ label: f.label, value: showValue(f, valueOf(t, f)), long: f.kind === "longtext" })),
    })),
    docs: docs.map((d) => ({ id: d.id, name: docName(d), status: STATUS_LABEL[d.status], total: gbp(d.total), issued: formatDate(d.issued_on) })),
    images: signed.filter((d) => isImage(d)).map((d) => ({ name: d.name, path: d.path, view: d.view, download: d.download })),
    others: signed.filter((d) => !isImage(d)).map((d) => ({ name: d.name, size: fileSize(d.size), download: d.download })),
    refs: (refs ?? []).map((f) => ({ name: f.name, view: /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name) ? refUrls[f.path] ?? null : null })),
    notes: (notes ?? []).map((n) => ({ who: n.author_name || n.author_email, when: formatDate(n.created_at), body: n.body, approval: n.kind === "approval" })),
    hours: minutes ? fmtMinutes(minutes) : null,
  };
}
