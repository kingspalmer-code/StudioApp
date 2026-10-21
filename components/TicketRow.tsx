import BizBadge from "./BizBadge";
import Link from "next/link";
import { type Ctx, dueLabel, dueOf, formatDate, isDone, startBy, startLabel } from "@/lib/priority";
import type { Business, ListTicket } from "@/lib/types";
import StatusChip from "./StatusChip";

export default function TicketRow({
  t,
  biz,
  ctx,
  rank,
  showBusiness = true,
  select,
  draft,
  plan,
}: {
  t: ListTicket;
  biz?: Business;
  ctx: Ctx;
  rank?: number;
  showBusiness?: boolean;
  // In Select mode the row ticks a box instead of opening the job.
  select?: { checked: boolean; onToggle: () => void };
  // A draft is waiting on the client's notes.
  draft?: boolean;
  // A calendar button beside the row that plans the job's steps on the Calendar.
  plan?: boolean;
}) {
  const done = isDone(t, ctx);
  const due = dueOf(t, ctx);
  // Without a due date there's no start-by to show.
  const sb = due ? startLabel(startBy(t, ctx)) : null;
  const cls = rank ? "ticket ranked" : "ticket";
  const body = (
    <>
      {rank ? <span className="rank">{rank}</span> : null}
      <BizBadge biz={biz} />
      <span className="main">
        <span className="t">{t.pinned ? "📌 " : ""}{t.title}</span>
        <span className="m">
          {showBusiness && biz ? `${biz.name} · ` : ""}
          {t.type}{due ? ` · ${done ? `Due ${formatDate(due)}` : dueLabel(due)}` : ""}
          {t.priority !== "Standard" && <span className={`pri-${t.priority}`}> · {t.priority}</span>}
          {draft && <span className="draft-flag"> · Draft to look at</span>}
        </span>
      </span>
      <span className="side">
        {done ? (
          <span className="when">{formatDate(t.delivered_at ?? t.deadline ?? t.updated_at)}</span>
        ) : showBusiness && sb ? (
          <span className={`when ${sb.tone}`}>{sb.text}</span>
        ) : null}
        <StatusChip status={t.status} ctx={ctx} />
      </span>
    </>
  );
  if (select)
    return (
      <label className={`${cls} picking${select.checked ? " picked" : ""}`}>
        <input type="checkbox" className="tick" checked={select.checked} onChange={select.onToggle} aria-label={`Select ${t.title}`} />
        {body}
      </label>
    );
  const row = (
    <Link href={`/tickets/${t.id}`} className={cls}>
      {body}
      <span className="chev" aria-hidden="true">›</span>
    </Link>
  );
  if (!plan) return row;
  return (
    <div className={`ticket-line${rank ? " ranked" : ""}`}>
      {row}
      <Link href={`/calendar?job=${t.id}`} className="ticket-plan" aria-label={`Add ${t.title} to the calendar`} title="Add to calendar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM4 10h16M8 3v4M16 3v4M12 13v5M9.5 15.5h5" />
        </svg>
      </Link>
    </div>
  );
}
