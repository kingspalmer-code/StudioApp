"use client";

import { useState, useTransition, type ReactNode } from "react";
import { deleteTickets, deliverTickets } from "@/app/actions";
import { finalStage, statusLabel, type Ctx } from "@/lib/priority";
import type { Business, ListTicket } from "@/lib/types";
import SplitHost from "./SplitHost";
import TicketRow from "./TicketRow";

// The queue's priority list, with a Select mode for marking several jobs delivered or deleting them at once.
export default function QueueList({
  toolbar,
  items,
  ranks,
  byId,
  ctx,
  job,
  jobs,
  canEdit,
  empty,
}: {
  toolbar: ReactNode;
  items: ListTicket[];
  ranks: Record<number, number>;
  byId: Record<string, Business>;
  ctx: Ctx;
  job: string;
  jobs: string;
  canEdit: boolean;
  empty: ReactNode;
}) {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const done = statusLabel(ctx, finalStage(ctx));
  const ids = items.filter((t) => picked.has(t.id)).map((t) => t.id);
  const n = ids.length;
  const noun = n === 1 ? job : jobs;

  const stop = () => { setSelecting(false); setPicked(new Set()); setConfirming(false); };
  const toggle = (id: number) =>
    setPicked((p) => { const next = new Set(p); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allPicked = items.length > 0 && n === items.length;
  const run = (fn: (ids: number[]) => Promise<void>) => start(async () => { await fn(ids); stop(); });

  return (
    <>
      <div className="toolbar">
        {toolbar}
        {canEdit && items.length > 0 && (
          <button type="button" className="btn plain small" onClick={() => (selecting ? stop() : setSelecting(true))}>
            {selecting ? "Done" : "Select"}
          </button>
        )}
      </div>

      {selecting && (
        <div className="pickbar" role="toolbar" aria-label={`Selected ${jobs}`}>
          {confirming ? (
            <>
              <span className="what">Delete {n} {noun} and their files? This can't be undone.</span>
              <button type="button" className="btn danger small" disabled={pending} onClick={() => run(deleteTickets)}>
                {pending ? "Deleting…" : "Delete"}
              </button>
              <button type="button" className="btn plain small" disabled={pending} onClick={() => setConfirming(false)}>Keep</button>
            </>
          ) : (
            <>
              <span className="what">{n ? `${n} selected` : `Tap ${jobs} to select them`}</span>
              <button type="button" className="btn plain small" onClick={() => setPicked(allPicked ? new Set() : new Set(items.map((t) => t.id)))}>
                {allPicked ? "Clear" : "Select all"}
              </button>
              <button type="button" className="btn small" disabled={!n || pending} onClick={() => run(deliverTickets)}>
                {pending ? "Saving…" : `Mark ${done.toLowerCase()}`}
              </button>
              <button type="button" className="btn danger small" disabled={!n || pending} onClick={() => setConfirming(true)}>Delete</button>
            </>
          )}
        </div>
      )}

      <SplitHost warm={items.slice(0, 2).map((t) => t.id)} off={selecting}>
      <div className="group" data-tour="list">
        {items.length
          ? items.map((t) => (
              <TicketRow
                key={t.id}
                t={t}
                biz={byId[t.business_id]}
                ctx={ctx}
                rank={ranks[t.id]}
                select={selecting ? { checked: picked.has(t.id), onToggle: () => toggle(t.id) } : undefined}
              />
            ))
          : empty}
      </div>
      </SplitHost>
    </>
  );
}
