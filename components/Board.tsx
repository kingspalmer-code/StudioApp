import Link from "next/link";
import BizBadge from "@/components/BizBadge";
import { finalStage, formatDate, isDone, money, sortQueue, startBy, startLabel, type Ctx } from "@/lib/priority";
import type { Business, ListTicket } from "@/lib/types";

// Every job in a column for the stage it's at, the last column holding the latest finished ones.
// Used by the Queue's Board view and by the Board block on Queue or Overview.
export default function Board({ all, ctx, byId, trade }: { all: ListTicket[]; ctx: Ctx; byId: Record<string, Business>; trade: boolean }) {
  const final = finalStage(ctx);
  const queue = sortQueue(all, ctx);
  return (
    <div className="board">
      {ctx.stages.map((st) => {
        const items =
          st.key === final
            ? all
                .filter((t) => isDone(t, ctx))
                .sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? ""))
                .slice(0, 15)
            : queue.filter((t) => t.status === st.key);
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
  );
}
