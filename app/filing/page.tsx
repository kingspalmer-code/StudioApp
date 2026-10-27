import Shell from "@/components/Shell";
import { coversFor } from "@/lib/deliveries";
import type { Doc } from "@/lib/documents";
import { monthKey, sentInvoice, type FiledMonth } from "@/lib/filing";
import { isDone, todayISO } from "@/lib/priority";
import { asClient, requireMember } from "@/lib/session";
import { withMine } from "@/lib/workspace";
import { LIST_COLUMNS, type ListTicket } from "@/lib/types";
import FilingDrawer from "./FilingDrawer";
import "./filing.css";

// The filing drawer: every finished job someone can see, filed behind a divider for the month it
// was finished in. This month's divider is always there, so a new one appears as each month
// starts; earlier months only show once something's filed in them. Read-only: a job's card opens
// into its file, with its details, quotes and invoices, images and notes.
export default async function FilingPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  const { file } = await searchParams;
  const { supabase, member, businesses, self, ctx, workspace, shell } = asClient(await requireMember(["manager", "designer", "client"], "requests"));
  const byId = Object.fromEntries(withMine(businesses, self, workspace.kind).map((b) => [b.id, b.name]));
  let query = supabase.from("tickets").select(LIST_COLUMNS);
  if (member.role === "client") query = query.in("business_id", member.business_ids ?? []);
  const { data } = await query.returns<ListTicket[]>();
  const finished = (data ?? [])
    .filter((t) => isDone(t, ctx))
    .map((t) => ({ ...t, when: t.delivered_at ?? t.deadline ?? t.updated_at }))
    .sort((a, b) => b.when.localeCompare(a.when) || b.id - a.id);
  // Money only shows to the studio.
  const studio = member.role === "designer";
  // Which jobs had an invoice go out, so their cards can say so.
  const [covers, { data: invoices }] = await Promise.all([
    coversFor(supabase, finished.map((t) => t.id)),
    studio
      ? supabase.from("documents").select("id, ticket_id, kind, status, sent_at, issued_on").eq("kind", "invoice").neq("status", "draft").not("ticket_id", "is", null).returns<Pick<Doc, "id" | "ticket_id" | "kind" | "status" | "sent_at" | "issued_on">[]>()
      : Promise.resolve({ data: [] as Pick<Doc, "id" | "ticket_id" | "kind" | "status" | "sent_at" | "issued_on">[] }),
  ]);
  const invoiceFor = (id: number) => sentInvoice((invoices ?? []).filter((d) => d.ticket_id === id));

  const now = monthKey(todayISO());
  const months: FiledMonth[] = [{ key: now, jobs: [] }];
  for (const t of finished) {
    // Never ahead of this month, for a job marked finished before the date it was due.
    const key = monthKey(t.when) > now ? now : monthKey(t.when);
    let m = months.find((x) => x.key === key);
    if (!m) months.push((m = { key, jobs: [] }));
    const invoice = invoiceFor(t.id);
    m.jobs.push({
      id: t.id,
      title: t.title,
      type: t.type,
      biz: byId[t.business_id] ?? "",
      finished: t.when,
      cover: covers[t.id]?.url ?? null,
      files: covers[t.id]?.count ?? 0,
      amount: studio ? t.quote_amount : null,
      invoice: invoice ? (invoice.status === "paid" ? "Paid" : "Invoiced") : null,
    });
  }
  months.sort((a, b) => b.key.localeCompare(a.key));

  const owner = member.role === "client" ? businesses.find((b) => b.id === member.business_id)?.name : workspace.owner_name || workspace.name;
  return (
    <Shell {...shell}>
      <FilingDrawer months={months} label={owner ? `${owner}’s files` : "Finished files"} openId={Number(file) || null} />
    </Shell>
  );
}
