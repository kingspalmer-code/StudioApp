import BizBadge from "@/components/BizBadge";
import Link from "next/link";
import Shell from "@/components/Shell";
import QueueList from "@/components/QueueList";
import Walkthrough from "@/components/Walkthrough";
import { daysFromToday, finalStage, formatDate, isDone, money, sortQueue, startBy, startLabel } from "@/lib/priority";
import { requireMember } from "@/lib/session";
import type { Ticket } from "@/lib/types";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; biz?: string; tour?: string }>;
}) {
  const { view = "list", biz = "all", tour } = await searchParams;
  const { supabase, member, businesses, ctx, terms, workspace, shell, viewing } = await requireMember(["designer", "manager"]);
  // Managers see the same queue, read-only: no Select, no delivering or deleting, no tour.
  const canEdit = member.role === "designer" && !viewing;
  const trade = workspace.kind === "trade";
  const { data } = await supabase.from("tickets").select("*").returns<Ticket[]>();
  const all = data ?? [];
  const queue = sortQueue(all, ctx);
  const byId = Object.fromEntries(businesses.map((b) => [b.id, b]));
  const filterBiz = businesses.find((b) => b.slug === biz);
  const keep = (t: Ticket) => !filterBiz || t.business_id === filterBiz.id;
  const href = (v: string, b: string) => `/queue?view=${v}&biz=${b}`;

  // One line of what matters, instead of a row of number tiles. The totals live on Overview.
  const startNow = queue.filter((t) => startBy(t, ctx) <= 0).length;
  const dueSoon = queue.filter((t) => { const d = daysFromToday(t.deadline); return d >= 0 && d <= 7; }).length;
  const waiting = trade ? 0 : all.filter((t) => t.status === "waiting").length;
  const summary = [
    startNow ? { n: startNow, text: "to start now", color: "var(--red)" } : null,
    dueSoon ? { n: dueSoon, text: "due this week" } : null,
    waiting ? { n: waiting, text: "waiting on clients", color: "var(--orange)" } : null,
  ].filter((x): x is { n: number; text: string; color?: string } => Boolean(x));
  const final = finalStage(ctx);
  const showFilter = businesses.length > 1 && businesses.length <= 8;
  const toolbar = (
    <>
      <p className="eyebrow">Queue</p>
      <nav className="seg" aria-label="Layout" data-tour="layout">
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
    </>
  );
  const listed = queue.filter(keep);

  return (
    <Shell {...shell}>
      <h1 className="large">Up next</h1>
      <p className="sub summary" data-tour="summary">
        {summary.length
          ? summary.map((x, i) => (
              <span key={x.text}>
                {i > 0 && " · "}
                <b style={x.color ? { color: x.color } : undefined}>{x.n}</b> {x.text}
              </span>
            ))
          : queue.length
            ? "Nothing urgent. Everything open, in the order to start it."
            : null}
      </p>

      {view !== "board" ? (
        <QueueList
          toolbar={toolbar}
          items={listed}
          ranks={Object.fromEntries(queue.map((t, i) => [t.id, i + 1]))}
          byId={byId}
          ctx={ctx}
          job={terms.job}
          jobs={terms.jobs}
          canEdit={canEdit}
          empty={<div className="empty">Nothing open{filterBiz ? ` for ${filterBiz.name}` : ""}. New {terms.jobs} appear here as soon as they're added.</div>}
        />
      ) : (
        <>
        <div className="toolbar">{toolbar}</div>
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
        </>
      )}
      {canEdit && view !== "board" && <Walkthrough force={tour === "1"} job={terms.job} clients={terms.clients} />}
    </Shell>
  );
}
