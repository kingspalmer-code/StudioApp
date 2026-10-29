import Link from "next/link";
import type { ReactNode } from "react";
import Board from "@/components/Board";
import BizBadge from "@/components/BizBadge";
import QueueList from "@/components/QueueList";
import QueueWidgets from "@/components/QueueWidgets";
import TicketRow from "@/components/TicketRow";
import ViewSwitch from "@/components/ViewSwitch";
import PageBlocks from "@/components/PageBlocks";
import Walkthrough from "@/components/Walkthrough";
import { BLOCKS, defaultLayout, layoutFor, type BlockId, type PageKey } from "@/lib/layouts";
import { bonusOatcakes, earnedFrom, hatchBase, oatcakesEarned } from "@/lib/pet";
import { EARN } from "@/lib/pickle/catalogue";
import { dueOf, dueWithin, formatDate, isAtRisk, isDone, money, sortQueue, startBy, stageColor } from "@/lib/priority";
import type { requireMember } from "@/lib/session";
import type { ListTicket } from "@/lib/types";
import { loadWidgets } from "@/lib/widgets";
import { jobsPage, withMine } from "@/lib/workspace";

type Session = Awaited<ReturnType<typeof requireMember>>;
export type Block = { id: BlockId; label: string; hint: string; half?: boolean; node: ReactNode };

// The blocks of the owner's and managers' Queue and Overview (lib/layouts.ts), all made from the
// one list of jobs, so one added under Customise shows straight away (the widgets once it's done). `view`, `biz` and `tour` are the Up next block's
// own switches (Priority list or Board, which client, the first-run tour); without a view in the
// address it's the one they last picked.
export async function homeBlocks({
  session,
  all,
  page,
  view: asked,
  biz = "all",
  tour,
}: {
  session: Session;
  all: ListTicket[];
  page: PageKey;
  view?: string;
  biz?: string;
  tour?: string;
}): Promise<{ blocks: Block[]; order: BlockId[] }> {
  const { supabase, member, businesses, self, ctx, terms, workspace, viewing, layouts, jobsView } = session;
  const view = asked === "board" || asked === "list" ? asked : jobsView;
  const canEdit = member.role === "designer" && !viewing;
  const trade = workspace.kind !== "studio";
  const queue = sortQueue(all, ctx);
  const done = all.filter((t) => isDone(t, ctx)).sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? ""));
  const risk = queue.filter((t) => isAtRisk(t, ctx));
  const byId = Object.fromEntries(withMine(businesses, self, workspace.kind).map((b) => [b.id, b]));

  // Pickle is your own, so the widgets stay out while viewing someone else's workspace; working
  // alone, there's nobody to break the work down by.
  const available = (Object.keys(BLOCKS) as BlockId[]).filter((id) => !(id === "widgets" && viewing) && !(id === "clients" && workspace.kind === "solo"));
  const order = layoutFor(layouts[page], page, member.role, available);
  const on = (id: BlockId) => order.includes(id);

  const make: Partial<Record<BlockId, () => ReactNode | Promise<ReactNode>>> = {
    // The owner's Pickle earns an oatcake for every job delivered; a manager's, for every request they
    // send. Everyone's also earns from their habits and to-dos.
    widgets: async () => {
      const earned = member.role === "designer" ? earnedFrom(done.length, EARN.job, await bonusOatcakes(supabase, member.email)) : await oatcakesEarned(supabase, member, ctx);
      const props = await loadWidgets(supabase, all, ctx, byId, { earned, base: hatchBase(member, earned) });
      return <QueueWidgets {...props} earnHint={member.role === "designer" ? undefined : "Send a request or do a habit to earn an oatcake"} />;
    },
    upnext: () => upNext(),
    board: () => (
      <>
        <p className="eyebrow">Board</p>
        <Board all={all} ctx={ctx} byId={byId} trade={trade} canMove={canEdit} />
      </>
    ),
    totals: () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const unpaid = all.reduce((sum, t) => sum + Math.max(0, (t.quote_amount ?? 0) - (t.paid_amount ?? 0)), 0);
      const stats = [
        { n: queue.length, label: `Open ${terms.jobs}` },
        trade
          ? { n: money(unpaid), label: "Quoted, not yet paid", color: unpaid ? "var(--orange)" : undefined }
          : ctx.noDates
            ? { n: queue.filter((t) => t.status === "waiting").length, label: "Waiting on clients" }
            : { n: queue.filter((t) => dueWithin(t, ctx, 7)).length, label: "Due this week" },
        // Without dates nothing can run late, so the at-risk count gives way to what's come in.
        ctx.noDates
          ? { n: all.filter((t) => new Date(t.created_at) >= monthStart).length, label: "New this month" }
          : { n: risk.length, label: "Worth starting", color: risk.length ? "var(--orange)" : undefined },
        { n: done.filter((t) => t.delivered_at && new Date(t.delivered_at) >= monthStart).length, label: "Delivered this month", color: "var(--green)" },
      ];
      return (
        <div className="stats">
          {stats.map((s) => (
            <div className="stat" key={s.label}>
              <b style={s.color ? { color: s.color } : undefined}>{s.n}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      );
    },
    clients: () => (
      <>
        <p className="eyebrow">By {terms.client}</p>
        <div className="biz-grid">
          {businesses.filter((b) => workspace.kind === "studio" || queue.some((t) => t.business_id === b.id)).map((b) => {
            const ts = all.filter((t) => t.business_id === b.id);
            const counts = ctx.stages.map((st) => ({ st, n: ts.filter((t) => t.status === st.key).length }));
            const total = ts.length || 1;
            // queue is already in queue order, which goes by due date when there are dates.
            const next = queue.find((t) => t.business_id === b.id);
            const nextDue = next && dueOf(next, ctx);
            return (
              <div className="biz" key={b.id}>
                <h4><BizBadge biz={b} size={26} />{b.name}</h4>
                <div className="meter" role="img" aria-label={counts.map((c) => `${c.n} ${c.st.label}`).join(", ")}>
                  {counts.map((c) => (
                    <i key={c.st.key} style={{ width: `${(c.n / total) * 100}%`, background: stageColor(c.st.color) }} />
                  ))}
                </div>
                <div className="legend">
                  {counts.filter((c) => c.n).map((c) => (
                    <span key={c.st.key}>
                      <span className="dot" style={{ background: stageColor(c.st.color), width: 7, height: 7 }} />
                      {c.n} {c.st.label}
                    </span>
                  ))}
                  {!ts.length && <span>No {terms.jobs} yet</span>}
                </div>
                <div className="kv">
                  <span>{ctx.noDates ? "Next up" : "Next due"}</span>
                  <b>{next ? `${next.title}${nextDue ? ` · ${formatDate(nextDue)}` : ""}` : "Nothing open"}</b>
                </div>
              </div>
            );
          })}
        </div>
      </>
    ),
    // Without dates nothing can run late, so the top of the up-next list stands in for at risk.
    risk: () => ctx.noDates ? (
      <>
        <p className="eyebrow">Up next</p>
        <div className="group">
          {queue.length ? queue.slice(0, 5).map((t) => <TicketRow key={t.id} t={t} biz={byId[t.business_id]} ctx={ctx} plan={canEdit} />) : <div className="empty">Nothing open right now.</div>}
        </div>
        <p className="foot">Pinned first, then by importance, oldest first.</p>
      </>
    ) : (
      <>
        <p className="eyebrow">Worth starting</p>
        <div className="group">
          {risk.length ? risk.map((t) => <TicketRow key={t.id} t={t} biz={byId[t.business_id]} ctx={ctx} plan={canEdit} />) : <div className="empty">Nothing needs starting right now.</div>}
        </div>
        <p className="foot">Should already have started, or waiting on the client within 5 days of the deadline.</p>
      </>
    ),
    delivered: () => (
      <>
        <p className="eyebrow">Delivered recently</p>
        <div className="group">
          {done.length ? done.slice(0, 10).map((t) => <TicketRow key={t.id} t={t} biz={byId[t.business_id]} ctx={ctx} />) : <div className="empty">Nothing delivered yet.</div>}
        </div>
      </>
    ),
  };

  // The heading, the one line of what matters, and the priority list (or the board) with its switches.
  function upNext() {
    const startNow = queue.filter((t) => dueOf(t, ctx) && startBy(t, ctx) <= 0).length;
    const dueSoon = queue.filter((t) => dueWithin(t, ctx, 7)).length;
    const waiting = trade ? 0 : all.filter((t) => t.status === "waiting").length;
    const summary = [
      startNow ? { n: startNow, text: "to start now", color: "var(--red)" } : null,
      dueSoon ? { n: dueSoon, text: "due this week" } : null,
      waiting ? { n: waiting, text: "waiting on clients", color: "var(--orange)" } : null,
    ].filter((x): x is { n: number; text: string; color?: string } => Boolean(x));
    const filterBiz = businesses.find((b) => b.slug === biz);
    const keep = (t: ListTicket) => !filterBiz || t.business_id === filterBiz.id;
    const href = (v: string, b: string) => `/${page}?view=${v}&biz=${b}`;
    const showFilter = workspace.kind !== "solo" && businesses.length > 1 && businesses.length <= 8;
    const toolbar = (
      <>
        <p className="eyebrow">{jobsPage(workspace.kind)}</p>
        <nav className="seg" aria-label="Layout" data-tour="layout">
          <ViewSwitch href={href("list", biz)} view="list" current={view !== "board"} remember={!session.shell.viewing}>Priority list</ViewSwitch>
          <ViewSwitch href={href("board", biz)} view="board" current={view === "board"} remember={!session.shell.viewing}>Board</ViewSwitch>
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
    return (
      <>
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
              ? ctx.noDates
                ? "Everything open: pinned first, then by importance, oldest first."
                : "Nothing urgent. Everything open, in the order to start it."
              : null}
        </p>
        {view !== "board" ? (
          <QueueList
            toolbar={toolbar}
            items={queue.filter(keep)}
            ranks={Object.fromEntries(queue.map((t, i) => [t.id, i + 1]))}
            byId={byId}
            ctx={ctx}
            job={terms.job}
            jobs={terms.jobs}
            canEdit={canEdit}
            empty={
              <div className="empty">
                {all.length || filterBiz ? <>Nothing open{filterBiz ? ` for ${filterBiz.name}` : ""}. New {terms.jobs} appear here as soon as they&apos;re added.</> : <>No {terms.jobs} yet. Add your first one and it lands here, in the order to start it.</>}
                {canEdit && <div><Link href="/portal" className="btn">Add a {terms.job}</Link></div>}
              </div>
            }
          />
        ) : (
          <>
            <div className="toolbar">{toolbar}</div>
            <Board all={all.filter(keep)} ctx={ctx} byId={byId} trade={trade} canMove={canEdit} />
          </>
        )}
        {canEdit && page === "queue" && view !== "board" && <Walkthrough force={tour === "1"} job={terms.job} clients={terms.clients} />}
      </>
    );
  }

  // The widgets visit Pickle and fetch covers, so they're only worked out when they're on the page.
  const nodes = await Promise.all(available.map((id) => (on(id) || id !== "widgets" ? make[id]?.() : null)));
  const blocks = available.map((id, i) => ({ id, ...BLOCKS[id], node: nodes[i] }));
  return { blocks, order };
}

// The page itself: its blocks, with Customise for anyone on their own account.
export default async function HomeBlocks(props: Parameters<typeof homeBlocks>[0] & { title: string; head?: ReactNode }) {
  const { session, all, page, title, head } = props;
  const { blocks, order } = await homeBlocks(props);
  const risk = sortQueue(all, session.ctx).filter((t) => isAtRisk(t, session.ctx));
  return (
    <PageBlocks
      page={page}
      title={title}
      head={head}
      blocks={blocks}
      order={order}
      defaults={defaultLayout(page, session.member.role).filter((id) => blocks.some((b) => b.id === id))}
      canCustomise={!session.shell.viewing}
      warm={order.includes("risk") ? risk.slice(0, 2).map((t) => t.id) : []}
    />
  );
}
