"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { saveProfile } from "@/lib/supabase/client";
import { NavIcon } from "./NavIcons";

type Link = { href: string; label: string; icon?: string; fixed?: boolean };

// Edit sidebar (right-click the sidebar): drag a button up or down to move it, drag it out of the
// sidebar to remove it, and tap any page under Add a page to put it in: a section, a Settings
// section, an app, your account, or (for platform admins) an admin page. A platform admin also has
// their Admin section here, and buttons drag between it and the sections above. Done saves to the
// account: the same switches as Settings > Menu's computer column, the order, the extra pages
// pinned (menu_pins) and what's in the Admin section (admin_menu). The ones that always stay (the
// first section, and Settings) can move but won't come out, or go into Admin.
export default function SidebarEdit({
  all,
  hidden,
  admin,
  pages,
  skip,
  onDone,
}: {
  all: Link[];
  hidden: string[];
  admin?: Link[];
  pages: { title: string; links: Link[] }[];
  skip: (l: Link) => boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const editable = all.filter((l) => !skip(l));
  const pinnable = new Set(pages.flatMap((g) => g.links.map((l) => l.href)));
  const known = new Map([...editable, ...pages.flatMap((g) => g.links), ...(admin ?? [])].map((l) => [l.href, l]));
  // The sections themselves (not pins), which are what Settings > Menu's switches cover.
  const sections = editable.filter((l) => !pinnable.has(l.href));
  const [items, setItems] = useState(() => editable.filter((l) => l.fixed || !hidden.includes(l.href)).filter((l) => !admin?.some((a) => a.href === l.href)));
  const [adminItems, setAdminItems] = useState(() => admin ?? []);
  const [drag, setDrag] = useState<{ href: string; x: number; y: number; out: boolean } | null>(null);
  const [nope, setNope] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // Labels are needed to pick pages, so a slim rail widens while editing and folds back after.
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.rail === "open") return;
    const prev = root.style.getPropertyValue("--rail-w");
    root.style.setProperty("--rail-w", "232px");
    root.dataset.rail = "open";
    return () => {
      if (prev) root.style.setProperty("--rail-w", prev);
      else root.style.removeProperty("--rail-w");
      delete root.dataset.rail;
    };
  }, []);

  const placed = new Set([...items, ...adminItems].map((l) => l.href));
  // Everything not in the sidebar yet, grouped: sections taken out first, then the rest.
  const unplaced = [
    { title: "Sections", links: sections.filter((l) => !placed.has(l.href)) },
    ...pages.map((g) => ({ title: g.title, links: g.links.filter((l) => !placed.has(l.href) && !skip(l)) })),
  ].filter((g) => g.links.length > 0);

  // Out means past the sidebar's right edge, onto the page.
  const isOut = (x: number) => {
    const bar = list.current?.closest(".bar")?.getBoundingClientRect();
    return bar ? x > bar.right + 12 : false;
  };
  // The drag is followed on the window rather than on the button, because the button itself moves
  // around the list (and between the sections and Admin) as it's dragged.
  function down(e: React.PointerEvent<HTMLDivElement>, l: Link) {
    if (e.button !== 0 || busy) return;
    e.preventDefault();
    start.current = { x: e.clientX, y: e.clientY, moved: false };
    setNope(null);
    const onMove = (ev: PointerEvent) => move(ev, l);
    const stop = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      if (ev.type === "pointerup") up(ev, l);
      else {
        start.current = null;
        setDrag(null);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function move(e: PointerEvent, l: Link) {
    const s = start.current;
    if (!s) return;
    if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 4) return;
    s.moved = true;
    const out = isOut(e.clientX);
    // The lifted button rides centred under the pointer.
    setDrag({ href: l.href, x: e.clientX - 22, y: e.clientY - 22, out });
    if (out) return;
    // Where it would land: after every other button (and the Admin heading) whose middle is above
    // the pointer. The sections and the Admin section are one list split by that heading, so a
    // button dragged between them stays the same element and keeps hold of the pointer.
    const split = "\u0000admin";
    const els = [...(list.current?.querySelectorAll<HTMLElement>("[data-href], [data-split]") ?? [])].filter((el) => el.dataset.href !== l.href);
    const to = els.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2 < e.clientY;
    }).length;
    const order = els.map((el) => el.dataset.href ?? split);
    order.splice(to, 0, l.href);
    const cut = order.indexOf(split);
    // The ones that always stay can't go into Admin.
    if (l.fixed && cut !== -1 && order.indexOf(l.href) > cut) return;
    const pick = (hrefs: string[]) => hrefs.map((h) => known.get(h)).filter((x) => x !== undefined);
    const main = pick(cut === -1 ? order : order.slice(0, cut));
    const inAdmin = cut === -1 ? [] : pick(order.slice(cut + 1));
    const same = (x: Link[], y: Link[]) => x.length === y.length && x.every((v, i) => v.href === y[i].href);
    setItems((cur) => (same(main, cur) ? cur : main));
    setAdminItems((cur) => (same(inAdmin, cur) ? cur : inAdmin));
  }

  function up(e: PointerEvent, l: Link) {
    const s = start.current;
    start.current = null;
    setDrag(null);
    if (!s?.moved || !isOut(e.clientX)) return;
    if (l.fixed) {
      setNope(l.href);
      return;
    }
    setItems((cur) => cur.filter((x) => x.href !== l.href));
    setAdminItems((cur) => cur.filter((x) => x.href !== l.href));
  }

  // Admin pages go into the Admin section; everything else joins the sections.
  function add(l: Link) {
    if (admin && l.href.startsWith("/admin")) setAdminItems((cur) => [...cur, l]);
    else setItems((cur) => [...cur, l]);
  }

  async function done() {
    setBusy(true);
    const mine = new Set(sections.map((l) => l.href));
    const shown = new Set(items.map((l) => l.href));
    // Buttons this editor doesn't show (like the studio's request form, reached from New) keep their switch.
    const computer = [...hidden.filter((h) => !mine.has(h)), ...sections.filter((l) => !shown.has(l.href)).map((l) => l.href)];
    const order = [...items, ...sections.filter((l) => !shown.has(l.href))].map((l) => l.href);
    const pins = items.filter((l) => pinnable.has(l.href)).map((l) => l.href);
    await saveProfile({ data: { hide_computer: computer, menu_order: order, menu_pins: pins, ...(admin ? { admin_menu: adminItems.map((l) => l.href) } : {}) } });
    router.refresh();
    setBusy(false);
    onDone();
  }

  const item = (l: Link) => (
    <div
      key={l.href}
      data-href={l.href}
      className={["rail-edit-item", drag?.href === l.href ? (drag.out ? "gone" : "held") : "", nope === l.href ? "nope" : ""].filter(Boolean).join(" ")}
      title={l.fixed ? `${l.label} always stays` : l.label}
      aria-label={l.label}
      onPointerDown={(e) => down(e, l)}
      onAnimationEnd={() => setNope(null)}
    >
      <NavIcon href={l.icon ?? l.href} strokeWidth={1.7} />
      <span className="rail-label">{l.label}</span>
    </div>
  );

  const dragging = drag ? [...items, ...adminItems].find((l) => l.href === drag.href) : undefined;
  return (
    <div className="rail-edit" ref={list}>
      <div className="rail-edit-tip">Drag to move. Drag out to remove.</div>
      <nav className="rail-nav editing" aria-label="Edit sidebar">
        {items.map(item)}
        {admin && (
          <div className="rail-admin-edit" data-split>
            <div className="rail-head">Admin <small>Only you see this</small></div>
            {adminItems.length === 0 && <div className="rail-admin-empty">Drag pages here</div>}
          </div>
        )}
        {adminItems.map(item)}
      </nav>
      {unplaced.length > 0 && (
        <div className="rail-removed">
          <div className="rail-head">Add a page</div>
          {unplaced.map((g) => (
            <div key={g.title} className="rail-add-group">
              <div className="rail-sub">{g.title}</div>
              {g.links.map((l) => (
                <button key={l.href} type="button" onClick={() => add(l)} title={`Add ${l.label}`} aria-label={`Add ${l.label} (${g.title})`}>
                  <NavIcon href={l.icon ?? l.href} strokeWidth={1.7} />
                  <span className="rail-label">{l.label}</span>
                  <svg className="rail-add" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>
                </button>
              ))}
            </div>
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
