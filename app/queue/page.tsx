import BizBadge from "@/components/BizBadge";
import Link from "next/link";
import Shell from "@/components/Shell";
import TicketRow from "@/components/TicketRow";
import { daysFromToday, finalStage, firstStage, formatDate, isDone, money, sortQueue, startBy, startLabel } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import type { Ticket } from "@/lib/types";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; biz?: string }>;
}) {
  const { view = "list", biz = "all" } = await searchParams;
  const { supabase, businesses, ctx, terms, workspace, shell } = await requireMember(["designer"]);
  const trade = workspace.kind === "trade";
  const { data } = await supabase.from("tickets").select("*").returns<Ticket[]>();
  const all = data ?? [];
  const queue = sortQueue(all, ctx);
  const byId = Object.fromEntries(businesses.map((b) => [b.id, b]));
  const filterBiz = businesses.find((b) => b.slug === biz);
  const keep = (t: Ticket) => !filterBiz || t.business_id === filterBiz.id;
  const href = (v: string, b: string) => `/queue?view=${v}&biz=${b}`;

  const stats = [
    { n: queue.filter((t) => startBy(t, ctx) <= 0).length, label: "Should start now", color: "var(--red)" },
    { n: queue.filter((t) => { const d = daysFromToday(t.deadline); return d >= 0 && d <= 7; }).length, label: "Due in the next 7 days" },
    { n: queue.filter((t) => t.status === firstStage(ctx)).length, label: ctx.stages[0]?.label ?? "New", color: "var(--blue)" },
    trade
      ? {
          n: money(all.reduce((sum, t) => sum + Math.max(0, (t.quote_amount ?? 0) - (t.paid_amount ?? 0)), 0)),
          label: "Quoted, not yet paid",
          color: "var(--orange)",
        }
      : { n: all.filter((t) => t.status === "waiting").length, label: "Waiting on client", color: "var(--orange)" },
  ];
  const final = finalStage(ctx);
  const showFilter = businesses.length > 1 && businesses.length <= 8;

  return (
    <Shell {...shell}>
      <h1 className="large">Up next</h1>
      <p className="sub">Every open {terms.job}, ordered by when you need to start it, not just when it's due.</p>
      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <b style={s.color ? { color: s.color } : undefined}>{s.n}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <p className="eyebrow">Queue</p>
        <nav className="seg" aria-label="Layout">
          <Link href={href("list", biz)} aria-current={view !== "board" ? "page" : undefined}>Priority list</Link>
          <Link href={href("board", biz)} aria-current={view === "board" ? "page" : undefined}>Board</Link>
        </nav>
        {showFilter && <nav className="seg" aria-label={terms.Client}>
          <Link href={href(view, "all")} aria-current={!filterBiz ? "page" : undefined}>All</Link>
          {businesses.map((b) => (
            <Link key={b.id} href={href(view, b.slug)} aria-current={filterBiz?.id === b.id ? "page" : undefined}>
              {b.name}
            </Link>
          ))}
        </nav>}
      </div>

      {view !== "board" ? (
        <>
          <div className="group">
            {queue.filter(keep).length ? (
              queue.filter(keep).map((t) => (
                <TicketRow key={t.id} t={t} biz={byId[t.business_id]} ctx={ctx} rank={queue.indexOf(t) + 1} />
              ))
            ) : (
              <div className="empty">Nothing open{filterBiz ? ` for ${filterBiz.name}` : ""}. New {terms.jobs} appear here as soon as they're added.</div>
            )}
          </div>
          <p className="foot">Numbers are the overall rank. Open a {terms.job} to change its stage or pin it to the top.</p>
        </>
      ) : (
        <div className="board">
          {ctx.stages.map((st) => {
            const items =
              st.key === final
                ? all
                    .filter((t) => isDone(t, ctx) && keep(t))
                    .sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? ""))
                    .slice(0, 15)
                : queue.filter((t) => t.status === st.key && keep(t));
            return (
              <div className="col" key={st.key}>
                <h3><span>{st.label}</span><span>{items.length}</span></h3>
                {items.map((t) => {
                  const b = byId[t.business_id];
                  const sb = startLabel(startBy(t, ctx));
                  return (
                    <Link href={`/tickets/${t.id}`} className="card" key={t.id}>
                      <span className="m">
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <BizBadge biz={b} size={20} />
                          {b?.name}
                        </span>
                        {t.priority !== "Standard" && <span className={`pri-${t.priority}`}>{t.priority}</span>}
                      </span>
                      <div className="t">{t.pinned ? "📌 " : ""}{t.title}</div>
                      <span className="m">
                        <span>{trade && t.quote_amount != null ? money(t.quote_amount) : t.type}</span>
                        {st.key === final ? (
                          <span className="when">{formatDate(t.delivered_at ?? t.deadline)}</span>
                        ) : (
                          <span className={`when ${sb.tone}`}>{sb.text}</span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
