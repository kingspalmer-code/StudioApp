import Shell from "@/components/Shell";
import { coversFor } from "@/lib/deliveries";
import { monthKey, type FiledMonth } from "@/lib/filing";
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
  const covers = await coversFor(supabase, finished.map((t) => t.id));
  // Money only shows to the studio.
  const studio = member.role === "designer";

  const now = monthKey(todayISO());
  const months: FiledMonth[] = [{ key: now, jobs: [] }];
  for (const t of finished) {
    // Never ahead of this month, for a job marked finished before the date it was due.
    const key = monthKey(t.when) > now ? now : monthKey(t.when);
    let m = months.find((x) => x.key === key);
    if (!m) months.push((m = { key, jobs: [] }));
    m.jobs.push({
      id: t.id,
      title: t.title,
      type: t.type,
      biz: byId[t.business_id] ?? "",
      finished: t.when,
      cover: covers[t.id]?.url ?? null,
      files: covers[t.id]?.count ?? 0,
      amount: studio ? t.quote_amount : null,
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
