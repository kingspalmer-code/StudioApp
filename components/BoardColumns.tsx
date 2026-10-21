"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { setStatus } from "@/app/actions";
import BizBadge from "@/components/BizBadge";
import { flashSaved } from "@/components/Saved";
import type { Business, Priority, Status } from "@/lib/types";

export type BoardCard = { id: number; rank: number; title: string; biz?: Business; priority: Priority; info: string; when: { text: string; tone?: string } | null };
export type BoardColumn = { key: Status; label: string; color: string; final: boolean; cards: BoardCard[] };

type Press = { id: number; from: Status; x: number; y: number; touch: boolean; el: HTMLElement; timer?: number; off?: () => void };
type Drag = { id: number; from: Status; x: number; y: number; offX: number; offY: number; w: number; over: Status | null };

// The board's columns. With canMove, a card can be dragged to another stage: with a mouse as soon as
// it moves, on a phone or tablet by holding it a moment first (so a swipe still scrolls the board).
// The card moves straight away and the stage is saved behind it (app/actions.ts setStatus), which
// also tells the client when a job goes to review or is finished, as the buttons on the job do.
export default function BoardColumns({ columns, canMove }: { columns: BoardColumn[]; canMove: boolean }) {
  const router = useRouter();
  const [cols, setCols] = useState(columns);
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const [drag, setDrag] = useState<Drag | null>(null);
  const press = useRef<Press | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const dragged = useRef(false);
  const board = useRef<HTMLDivElement>(null);

  // Fresh jobs from the server (after a save, or someone else's change) replace the local copy.
  useEffect(() => setCols(columns), [columns]);

  const update = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  function stageAt(x: number, y: number): Status | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-stage]");
    return (el?.dataset.stage as Status | undefined) ?? null;
  }

  function begin(p: Press, x: number, y: number) {
    const r = p.el.getBoundingClientRect();
    update({ id: p.id, from: p.from, x, y, offX: p.x - r.left, offY: p.y - r.top, w: r.width, over: p.from });
    navigator.vibrate?.(10);
  }

  function finish() {
    const p = press.current;
    if (p?.timer) clearTimeout(p.timer);
    p?.off?.();
    press.current = null;
    update(null);
  }

  function onMove(e: PointerEvent) {
    const p = press.current;
    if (!p) return;
    const d = dragRef.current;
    if (!d) {
      const far = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      // A mouse starts dragging once it moves; a finger that moves before the hold is up is scrolling.
      if (!p.touch && far > 5) begin(p, e.clientX, e.clientY);
      else if (p.touch && far > 8) finish();
      return;
    }
    // Near either side of the board, it scrolls along so far-off stages can be reached.
    const b = board.current?.getBoundingClientRect();
    if (b && board.current) {
      if (e.clientX > b.right - 48) board.current.scrollLeft += 14;
      else if (e.clientX < b.left + 48) board.current.scrollLeft -= 14;
    }
    update({ ...d, x: e.clientX, y: e.clientY, over: stageAt(e.clientX, e.clientY) });
  }

  function onUp() {
    const d = dragRef.current;
    if (d) {
      dragged.current = true;
      setTimeout(() => (dragged.current = false), 0);
      if (d.over && d.over !== d.from) move(d.id, d.from, d.over);
    }
    finish();
  }

  function onCancel() {
    finish();
  }

  // While a card is held on a touch screen, the page stays put rather than scrolling under it.
  function holdStill(e: TouchEvent) {
    if (dragRef.current) e.preventDefault();
  }

  function onDown(e: ReactPointerEvent<HTMLAnchorElement>, id: number, from: Status) {
    if (!canMove || e.button !== 0 || press.current) return;
    const touch = e.pointerType !== "mouse";
    const p: Press = { id, from, x: e.clientX, y: e.clientY, touch, el: e.currentTarget };
    if (touch) p.timer = window.setTimeout(() => press.current === p && begin(p, p.x, p.y), 280);
    press.current = p;
    // The listeners from this render, kept with the press so the same ones come off again.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("touchmove", holdStill, { passive: false });
    p.off = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", holdStill);
    };
  }

  async function move(id: number, from: Status, to: Status) {
    const card = colsRef.current.find((c) => c.key === from)?.cards.find((c) => c.id === id);
    const target = colsRef.current.find((c) => c.key === to);
    if (!card || !target) return;
    const moved = { ...card, when: target.final ? { text: "Just now" } : null };
    setCols((cs) =>
      cs.map((c) =>
        c.key === from
          ? { ...c, cards: c.cards.filter((x) => x.id !== id) }
          : c.key === to
            ? { ...c, cards: c.final ? [moved, ...c.cards] : [...c.cards, moved].sort((a, b) => a.rank - b.rank) }
            : c
      )
    );
    try {
      await setStatus(id, to);
      flashSaved(`Moved to ${target.label}`);
    } catch {
      flashSaved("Couldn't move it, try again");
      router.refresh();
    }
  }

  useEffect(() => () => press.current?.off?.(), []);

  const lifted = drag && cols.flatMap((c) => c.cards).find((c) => c.id === drag.id);
  return (
    <>
      <div className={`board${canMove ? " movable" : ""}${drag ? " dragging" : ""}`} ref={board}>
        {cols.map((st) => (
          <div
            className={`col${drag && drag.over === st.key && drag.from !== st.key ? " over" : ""}`}
            key={st.key}
            data-stage={st.key}
            style={{ "--stage": st.color } as CSSProperties}
          >
            <h3>
              <span><span className="dot" aria-hidden />{st.label}</span>
              <span>{st.cards.length}</span>
            </h3>
            {st.cards.map((t) => (
              <Link
                href={`/tickets/${t.id}`}
                className={`card${drag?.id === t.id ? " lifted" : ""}`}
                key={t.id}
                draggable={false}
                onPointerDown={(e) => onDown(e, t.id, st.key)}
                onClickCapture={(e) => dragged.current && e.preventDefault()}
                onContextMenu={(e) => canMove && e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType !== "mouse" && e.preventDefault()}
              >
                <CardBody t={t} />
              </Link>
            ))}
            {!st.cards.length && <div className="col-empty">{canMove ? "Drag a job here" : "Nothing here"}</div>}
          </div>
        ))}
      </div>
      {drag && lifted && (
        <div className="card ghost" aria-hidden style={{ left: drag.x - drag.offX, top: drag.y - drag.offY, width: drag.w, "--stage": cols.find((c) => c.key === (drag.over ?? drag.from))?.color } as CSSProperties}>
          <CardBody t={lifted} />
        </div>
      )}
    </>
  );
}

function CardBody({ t }: { t: BoardCard }) {
  return (
    <>
      <span className="m">
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <BizBadge biz={t.biz} size={20} />
          {t.biz?.name}
        </span>
        {t.priority !== "Standard" && <span className={`pri-${t.priority}`}>{t.priority}</span>}
      </span>
      <div className="t">{t.title}</div>
      <span className="m">
        <span>{t.info}</span>
        {t.when && <span className={`when ${t.when.tone ?? ""}`}>{t.when.text}</span>}
      </span>
    </>
  );
}
