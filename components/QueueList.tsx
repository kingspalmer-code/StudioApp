"use client";

import { useEffect, useState, useTransition, type MouseEvent, type ReactNode } from "react";
import { deleteTickets, deliverTickets } from "@/app/actions";
import { finalStage, statusLabel, type Ctx } from "@/lib/priority";
import type { Business, Ticket } from "@/lib/types";
import SplitPanel, { SPLIT_QUERY } from "./SplitPanel";
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
  items: Ticket[];
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
  const [openId, setOpenId] = useState<number | null>(null);
  const done = statusLabel(ctx, finalStage(ctx));
  const ids = items.filter((t) => picked.has(t.id)).map((t) => t.id);
  const n = ids.length;
  const noun = n === 1 ? job : jobs;

  const stop = () => { setSelecting(false); setPicked(new Set()); setConfirming(false); };
  const toggle = (id: number) =>
    setPicked((p) => { const next = new Set(p); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allPicked = items.length > 0 && n === items.length;
  const run = (fn: (ids: number[]) => Promise<void>) => start(async () => { await fn(ids); stop(); });

  // While a job is open beside the list, the page makes room for it (globals.css, html.split-open).
  useEffect(() => {
    document.documentElement.classList.toggle("split-open", openId !== null);
    return () => document.documentElement.classList.remove("split-open");
  }, [openId]);

  // Going back to a narrow window closes the panel rather than squashing the list.
  useEffect(() => {
    const wide = window.matchMedia(SPLIT_QUERY);
    const fit = () => !wide.matches && setOpenId(null);
    wide.addEventListener("change", fit);
    return () => wide.removeEventListener("change", fit);
  }, []);

  // On wide screens a plain click on a job opens it beside the list; Cmd-click and narrow screens
  // still go to its page.
  const openBeside = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!window.matchMedia(SPLIT_QUERY).matches) return;
    const a = (e.target as Element).closest?.("a.ticket");
    const m = a?.getAttribute("href")?.match(/^\/tickets\/(\d+)$/);
    if (!m) return;
    e.preventDefault();
    setOpenId(Number(m[1]));
  };

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

      <div className="group" data-tour="list" onClickCapture={openBeside}>
        {items.length
          ? items.map((t) => (
              <TicketRow
                key={t.id}
                t={t}
                biz={byId[t.business_id]}
                ctx={ctx}
                rank={ranks[t.id]}
                open={t.id === openId}
                select={selecting ? { checked: picked.has(t.id), onToggle: () => toggle(t.id) } : undefined}
              />
            ))
          : empty}
      </div>

      {openId !== null && <SplitPanel id={openId} onOpen={setOpenId} onClose={() => setOpenId(null)} />}
    </>
  );
}
