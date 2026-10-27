// Filing (/filing): every finished job, listed under the month it was finished in. Shared by the
// page, the list and the file a job opens into.

import type { Doc } from "@/lib/documents";

const TZ = process.env.NEXT_PUBLIC_TIMEZONE || "Europe/London";
const YM = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" });

// "2026-10" for a moment, in the studio's timezone.
export const monthKey = (iso: string) => YM.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)).slice(0, 7);

export function monthName(key: string, style: "long" | "short" = "long") {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: style, timeZone: "UTC" });
}

// One job's row in the list.
export type FiledJob = {
  id: number;
  title: string;
  type: string;
  biz: string;
  finished: string;
  cover: string | null;
  files: number;
  amount: number | null;
  // "Paid" or "Invoiced" when an invoice went out for it, for the studio only.
  invoice: string | null;
};

// One month, and the jobs filed under it, newest first.
export type FiledMonth = { key: string; jobs: FiledJob[] };

// Everything in a job's file, read when it's opened.
export type JobFile = {
  id: number;
  title: string;
  type: string;
  biz: string;
  status: string;
  started: string;
  finished: string;
  details: { title: string | null; rows: { label: string; value: string; long: boolean }[] }[];
  // The invoice that went to the customer, shown first so past invoices are one tap away.
  invoice: { id: number; name: string; status: string; paid: boolean; total: string; sent: string; to: string; filename: string } | null;
  docs: { id: number; name: string; status: string; total: string; issued: string }[];
  images: { name: string; path: string | null; view: string | null; download: string | null }[];
  others: { name: string; size: string; download: string | null }[];
  refs: { name: string; view: string | null }[];
  notes: { who: string; when: string; body: string; approval: boolean }[];
  hours: string | null;
};

// The invoice the customer got for a job: a paid one first, then the latest sent. A draft that
// never went out doesn't count.
export function sentInvoice<T extends Pick<Doc, "id" | "kind" | "status" | "sent_at" | "issued_on">>(docs: T[]): T | null {
  const rank = (d: T) => (d.status === "paid" ? 1 : 0);
  const when = (d: T) => d.sent_at ?? d.issued_on;
  return docs.filter((d) => d.kind === "invoice" && d.status !== "draft").sort((a, b) => rank(b) - rank(a) || when(b).localeCompare(when(a)) || b.id - a.id)[0] ?? null;
}
