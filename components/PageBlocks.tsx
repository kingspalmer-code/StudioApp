"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, type DragEvent, type ReactNode } from "react";
import { saveProfile } from "@/lib/supabase/client";
import { layoutKey, type BlockId, type PageKey } from "@/lib/layouts";
import { flashSaved } from "./Saved";
import SplitHost from "./SplitHost";

type Block = { id: BlockId; label: string; hint: string; half?: boolean; node: ReactNode };

// Queue and Overview as a stack of blocks (lib/layouts.ts). Customise, at the top of the page, turns
// each block into a card to drag (or nudge with the arrows) up and down or take off the page, and
// lists the ones that aren't on it under Add to this page. Done saves to the account.
export default function PageBlocks({
  page,
  title,
  head,
  blocks,
  order,
  defaults,
  canCustomise,
  warm = [],
}: {
  page: PageKey;
  title: string;
  head?: ReactNode;
  blocks: Block[];
  order: BlockId[];
  defaults: BlockId[];
  canCustomise: boolean;
  warm?: number[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<BlockId[] | null>(null);
  const [dragging, setDragging] = useState<BlockId | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = draft !== null;
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const shown = (draft ?? order).map((id) => byId.get(id)).filter((b): b is Block => Boolean(b));
  const spare = blocks.filter((b) => !(draft ?? order).includes(b.id));

  useEffect(() => {
    if (!editing) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setDraft(null);
    document.addEventListener("keydown", key);
    document.documentElement.classList.add("customising");
    return () => {
      document.removeEventListener("keydown", key);
      document.documentElement.classList.remove("customising");
    };
  }, [editing]);

  const move = (id: BlockId, to: number) =>
    setDraft((d) => {
      if (!d) return d;
      const next = d.filter((x) => x !== id);
      next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
      return next;
    });
  const remove = (id: BlockId) => setDraft((d) => d && d.filter((x) => x !== id));
  const add = (id: BlockId) => setDraft((d) => d && [...d, id]);

  const done = async () => {
    if (!draft) return;
    if (draft.join() === order.join()) return setDraft(null);
    setBusy(true);
    const { error } = await saveProfile({ data: { [layoutKey(page)]: draft } });
    setBusy(false);
    if (error) return flashSaved("Couldn't save, try again");
    setDraft(null);
    flashSaved();
    router.refresh();
  };

  // Dragging a card over another puts it in that card's place.
  const over = (e: DragEvent, id: BlockId) => {
    if (!dragging || dragging === id || !draft) return;
    e.preventDefault();
    move(dragging, draft.indexOf(id));
  };

  // Two half-width blocks one after the other sit side by side.
  const rows: Block[][] = [];
  for (const b of shown) {
    const last = rows[rows.length - 1];
    if (!editing && b.half && last?.length === 1 && last[0].half) last.push(b);
    else rows.push([b]);
  }

  return (
    <>
      {(head || (canCustomise && !editing)) && (
        <div className="page-tools">
          <div>{head}</div>
          {canCustomise && !editing && (
            <button type="button" className="btn plain small customise-btn" onClick={() => setDraft(order)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
              Customise
            </button>
          )}
        </div>
      )}

      {editing ? (
        <div className="pb-edit">
          <p className="pb-intro">Drag the blocks into the order you want, or take them off with the minus. Anything you take off waits under Add to this page.</p>
          {shown.map((b, i) => (
            <section
              key={b.id}
              className={`pb-block${dragging === b.id ? " dragging" : ""}`}
              onDragOver={(e) => over(e, b.id)}
              onDrop={(e) => e.preventDefault()}
            >
              <header
                className="pb-head"
                draggable
                onDragStart={(e) => { setDragging(b.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", b.id); }}
                onDragEnd={() => setDragging(null)}
              >
                <button type="button" className="pb-remove" onClick={() => remove(b.id)} aria-label={`Take ${b.label} off this page`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12h10" /></svg>
                </button>
                <span className="pb-name"><b>{b.label}</b><small>{b.hint}</small></span>
                <button type="button" className="pb-arrow" onClick={() => move(b.id, i - 1)} disabled={i === 0} aria-label={`Move ${b.label} up`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14l5-5 5 5" /></svg>
                </button>
                <button type="button" className="pb-arrow" onClick={() => move(b.id, i + 1)} disabled={i === shown.length - 1} aria-label={`Move ${b.label} down`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg>
                </button>
                <span className="pb-grip" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M5 9h14M5 15h14" /></svg>
                </span>
              </header>
              <div className="pb-preview" inert>
                {b.node ?? <div className="empty">Shows when you press Done.</div>}
              </div>
            </section>
          ))}
          {!shown.length && <div className="pb-empty">Nothing on this page yet. Add something below.</div>}

          <p className="eyebrow">Add to this page</p>
          {spare.length ? (
            <div className="pb-spare">
              {spare.map((b) => (
                <button type="button" key={b.id} onClick={() => add(b.id)}>
                  <span className="pb-plus" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M12 7v10M7 12h10" /></svg>
                  </span>
                  <span className="pb-name"><b>{b.label}</b><small>{b.hint}</small></span>
                </button>
              ))}
            </div>
          ) : (
            <p className="foot">Everything is already on this page.</p>
          )}

          <div className="pb-bar" role="toolbar" aria-label={`Customise ${title}`}>
            <span className="pb-bar-title">Customise<span> {title}</span></span>
            <button type="button" className="btn plain small" onClick={() => setDraft(defaults)} disabled={busy}>Reset</button>
            <button type="button" className="btn plain small" onClick={() => setDraft(null)} disabled={busy}>Cancel</button>
            <button type="button" className="btn small" onClick={done} disabled={busy}>{busy ? "Saving…" : "Done"}</button>
          </div>
        </div>
      ) : (
        <SplitHost warm={warm}>
          {rows.map((row) => (
            <Fragment key={row.map((b) => b.id).join()}>
              {row.length === 2 ? (
                <div className="cols pb-row">
                  {row.map((b) => <div key={b.id}>{b.node}</div>)}
                </div>
              ) : (
                <div className="pb-row" data-block={row[0].id}>{row[0].node}</div>
              )}
            </Fragment>
          ))}
          {!rows.length && (
            <div className="empty">
              Nothing on this page.{canCustomise && <div><button type="button" className="btn" onClick={() => setDraft([])}>Customise</button></div>}
            </div>
          )}
        </SplitHost>
      )}
    </>
  );
}
