import BoardColumns, { type BoardCard, type BoardColumn } from "@/components/BoardColumns";
import { dueOf, finalStage, formatDate, isDone, money, sortQueue, stageColor, startBy, startLabel, type Ctx } from "@/lib/priority";
import type { Business, ListTicket } from "@/lib/types";

// Every job in a column for the stage it's at, the last column holding the latest finished ones.
// Used by the Queue's Board view and by the Board block on Queue or Overview. Each column wears its
// stage's colour (Settings > Stages), and anyone who may change jobs can drag a card to another stage.
export default function Board({ all, ctx, byId, trade, canMove = false }: { all: ListTicket[]; ctx: Ctx; byId: Record<string, Business>; trade: boolean; canMove?: boolean }) {
  const final = finalStage(ctx);
  const queue = sortQueue(all, ctx);
  const rank = new Map(queue.map((t, i) => [t.id, i]));
  const card = (t: ListTicket, done: boolean): BoardCard => {
    const sb = !done && dueOf(t, ctx) ? startLabel(startBy(t, ctx)) : null;
    return {
      id: t.id,
      rank: rank.get(t.id) ?? queue.length,
      title: `${t.pinned ? "📌 " : ""}${t.title}`,
      biz: byId[t.business_id],
      priority: t.priority,
      info: trade && t.quote_amount != null ? money(t.quote_amount) : t.type,
      when: done ? { text: formatDate(t.delivered_at ?? t.deadline ?? t.updated_at) } : sb ? { text: sb.text, tone: sb.tone } : null,
    };
  };
  const columns: BoardColumn[] = ctx.stages.map((st) => ({
    key: st.key,
    label: st.label,
    color: stageColor(st.color),
    final: st.key === final,
    cards:
      st.key === final
        ? all
            .filter((t) => isDone(t, ctx))
            .sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? ""))
            .slice(0, 15)
            .map((t) => card(t, true))
        : queue.filter((t) => t.status === st.key).map((t) => card(t, false)),
  }));
  return <BoardColumns columns={columns} canMove={canMove} />;
}
