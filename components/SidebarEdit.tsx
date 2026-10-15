"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NavIcon } from "./NavIcons";

type Link = { href: string; label: string; icon?: string; fixed?: boolean };

// Edit sidebar (right-click the sidebar): drag a button up or down to move it, drag it out of the
// sidebar to remove it, and tap a removed one to put it back. Done saves to the account, the same
// switches as Settings > Menu's computer column, plus the order. The ones that always stay (the
// first section, and Settings) can move but won't come out.
export default function SidebarEdit({ all, hidden, skip, onDone }: { all: Link[]; hidden: string[]; skip: (l: Link) => boolean; onDone: () => void }) {
  const router = useRouter();
  const editable = all.filter((l) => !skip(l));
  const [items, setItems] = useState(() => editable.filter((l) => l.fixed || !hidden.includes(l.href)));
  const [removed, setRemoved] = useState(() => editable.filter((l) => !l.fixed && hidden.includes(l.href)));
  const [drag, setDrag] = useState<{ href: string; x: number; y: number; out: boolean } | null>(null);
  const [nope, setNope] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // Out means past the sidebar's right edge, onto the page.
  const isOut = (x: number) => {
    const bar = list.current?.closest(".bar")?.getBoundingClientRect();
    return bar ? x > bar.right + 12 : false;
  };

  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || busy) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, moved: false };
    setNope(null);
  }

  function move(e: React.PointerEvent<HTMLDivElement>, l: Link) {
    const s = start.current;
    if (!s) return;
    if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 4) return;
    s.moved = true;
    const out = isOut(e.clientX);
    // The lifted button rides centred under the pointer.
    setDrag({ href: l.href, x: e.clientX - 22, y: e.clientY - 22, out });
    if (out) return;
    // Where it would land: after every other button whose middle is above the pointer.
    const others = [...(list.current?.querySelectorAll<HTMLElement>("[data-href]") ?? [])].filter((el) => el.dataset.href !== l.href);
    const to = others.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2 < e.clientY;
    }).length;
    setItems((cur) => {
      const from = cur.findIndex((x) => x.href === l.href);
      if (from === -1 || from === to) return cur;
      const next = cur.filter((x) => x.href !== l.href);
      next.splice(to, 0, l);
      return next;
    });
  }

  function up(e: React.PointerEvent<HTMLDivElement>, l: Link) {
    const s = start.current;
    start.current = null;
    setDrag(null);
    if (!s?.moved || !isOut(e.clientX)) return;
    if (l.fixed) {
      setNope(l.href);
      return;
    }
    setItems((cur) => cur.filter((x) => x.href !== l.href));
    setRemoved((cur) => [...cur, l]);
  }

  function putBack(l: Link) {
    setRemoved((cur) => cur.filter((x) => x.href !== l.href));
    setItems((cur) => [...cur, l]);
  }

  async function done() {
    setBusy(true);
    const mine = new Set(editable.map((l) => l.href));
    // Buttons this editor doesn't show (like the studio's request form, reached from New) keep their switch.
    const computer = [...hidden.filter((h) => !mine.has(h)), ...removed.map((l) => l.href)];
    const order = [...items, ...removed].map((l) => l.href);
    const supabase = createClient();
    await supabase.auth.updateUser({ data: { hide_computer: computer, menu_order: order } });
    await supabase.auth.refreshSession();
    router.refresh();
    setBusy(false);
    onDone();
  }

  const dragging = drag ? all.find((l) => l.href === drag.href) : undefined;
  return (
    <div className="rail-edit" ref={list}>
      <div className="rail-edit-tip">Drag to move. Drag out to remove.</div>
      <nav className="rail-nav editing" aria-label="Edit sidebar">
        {items.map((l) => (
          <div
            key={l.href}
            data-href={l.href}
            className={["rail-edit-item", drag?.href === l.href ? (drag.out ? "gone" : "held") : "", nope === l.href ? "nope" : ""].filter(Boolean).join(" ")}
            title={l.fixed ? `${l.label} always stays` : l.label}
            aria-label={l.label}
            onPointerDown={down}
            onPointerMove={(e) => move(e, l)}
            onPointerUp={(e) => up(e, l)}
            onPointerCancel={() => { start.current = null; setDrag(null); }}
            onAnimationEnd={() => setNope(null)}
          >
            <NavIcon href={l.icon ?? l.href} strokeWidth={1.7} />
            <span className="rail-label">{l.label}</span>
          </div>
        ))}
      </nav>
      {removed.length > 0 && (
        <div className="rail-removed">
          <div className="rail-head">Removed</div>
          {removed.map((l) => (
            <button key={l.href} type="button" onClick={() => putBack(l)} title={`Add ${l.label} back`} aria-label={`Add ${l.label} back`}>
              <NavIcon href={l.icon ?? l.href} strokeWidth={1.7} />
              <span className="rail-label">{l.label}</span>
              <svg className="rail-add" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="btn small rail-done" onClick={done} disabled={busy}>
        {busy ? "Saving" : "Done"}
      </button>
      {drag && dragging && (
        <div className={["rail-ghost", drag.out ? (dragging.fixed ? "stays" : "out") : ""].filter(Boolean).join(" ")} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <NavIcon href={dragging.icon ?? dragging.href} strokeWidth={1.7} />
          {drag.out && <span className="rail-ghost-note">{dragging.fixed ? "Always stays" : "Remove"}</span>}
        </div>
      )}
    </div>
  );
}
