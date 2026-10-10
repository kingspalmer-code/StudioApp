import BizBadge from "./BizBadge";
import Link from "next/link";
import { dueLabel, formatDate, startBy, startLabel } from "@/lib/priority";
import type { Business, Ticket } from "@/lib/types";
import StatusChip from "./StatusChip";

export default function TicketRow({
  t,
  biz,
  rank,
  showBusiness = true,
}: {
  t: Ticket;
  biz?: Business;
  rank?: number;
  showBusiness?: boolean;
}) {
  const sb = startLabel(startBy(t));
  return (
    <Link href={`/tickets/${t.id}`} className={rank ? "ticket ranked" : "ticket"}>
      {rank ? <span className="rank">{rank}</span> : null}
      <BizBadge biz={biz} />
      <span className="main">
        <span className="t">{t.pinned ? "📌 " : ""}{t.title}</span>
        <span className="m">
          {showBusiness && biz ? `${biz.name} · ` : ""}
          {t.type} · {dueLabel(t.deadline)}
          {t.priority !== "Standard" && <span className={`pri-${t.priority}`}> · {t.priority}</span>}
        </span>
      </span>
      <span className="side">
        {t.status === "done" ? (
          <span className="when">{formatDate(t.delivered_at ?? t.deadline)}</span>
        ) : showBusiness ? (
          <span className={`when ${sb.tone}`}>{sb.text}</span>
        ) : null}
        <StatusChip status={t.status} />
      </span>
      <span className="chev" aria-hidden="true">›</span>
    </Link>
  );
}
