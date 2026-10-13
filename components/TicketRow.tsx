import BizBadge from "./BizBadge";
import Link from "next/link";
import { type Ctx, dueLabel, formatDate, isDone, startBy, startLabel } from "@/lib/priority";
import type { Business, Ticket } from "@/lib/types";
import StatusChip from "./StatusChip";

export default function TicketRow({
  t,
  biz,
  ctx,
  rank,
  showBusiness = true,
  select,
  draft,
  open,
}: {
  t: Ticket;
  biz?: Business;
  ctx: Ctx;
  rank?: number;
  showBusiness?: boolean;
  // In Select mode the row ticks a box instead of opening the job.
  select?: { checked: boolean; onToggle: () => void };
  // A draft is waiting on the client's notes.
  draft?: boolean;
  // Showing in the panel beside the queue (components/SplitPanel.tsx).
  open?: boolean;
}) {
  const done = isDone(t, ctx);
  const sb = startLabel(startBy(t, ctx));
  const cls = (rank ? "ticket ranked" : "ticket") + (open ? " open" : "");
  const body = (
    <>
      {rank ? <span className="rank">{rank}</span> : null}
      <BizBadge biz={biz} />
      <span className="main">
        <span className="t">{t.pinned ? "📌 " : ""}{t.title}</span>
        <span className="m">
          {showBusiness && biz ? `${biz.name} · ` : ""}
          {t.type} · {done ? `Due ${formatDate(t.deadline)}` : dueLabel(t.deadline)}
          {t.priority !== "Standard" && <span className={`pri-${t.priority}`}> · {t.priority}</span>}
          {draft && <span className="draft-flag"> · Draft to look at</span>}
        </span>
      </span>
      <span className="side">
        {done ? (
          <span className="when">{formatDate(t.delivered_at ?? t.deadline)}</span>
        ) : showBusiness ? (
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
  return (
    <Link href={`/tickets/${t.id}`} className={cls}>
      {body}
      <span className="chev" aria-hidden="true">›</span>
    </Link>
  );
}
