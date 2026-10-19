"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Business } from "@/lib/types";
import BizBadge from "./BizBadge";
import { openCreate } from "./panel-events";
import { NavIcon } from "./NavIcons";
import { openSearch } from "./panel-events";
import SidebarEdit from "./SidebarEdit";

type Link = { href: string; label: string; icon?: string; fixed?: boolean };

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
  );
}

// On iPad and desktop the top bar becomes a slim rail down the left: a create button, search, then
// the sections as icons. Labels show as tooltips and to screen readers. Dragging its edge out
// (RailGrip) widens it into a sidebar that shows the labels and a list of clients to jump to.
// Clients get the same New and Search at the top: New goes straight to their request form, and
// Search covers their own requests (`newHref` set).
// Right-clicking the sidebar offers Edit sidebar (SidebarEdit), to drag its buttons around or out.
// A platform admin also gets an Admin section under the sections, which folds shut (remembered on
// this computer) and is edited along with the rest.
export default function RailNav({
  links,
  all = links,
  hidden = [],
  admin,
  pages = [],
  editable = false,
  canCreate,
  clients = [],
  newHref,
}: {
  links: Link[];
  all?: Link[];
  hidden?: string[];
  admin?: Link[];
  pages?: { title: string; links: Link[] }[];
  editable?: boolean;
  canCreate: boolean;
  clients?: Business[];
  newHref?: string;
}) {
  const path = usePathname();
  const [adminOpen, setAdminOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("admin_section") === "shut") setAdminOpen(false);
    } catch {}
  }, []);
  function foldAdmin() {
    setAdminOpen(!adminOpen);
    try {
      localStorage.setItem("admin_section", adminOpen ? "shut" : "open");
    } catch {}
  }
  // With pages pinned from inside a section (Settings and Settings > Stages, say), only the
  // closest match lights up.
  const current = [...links, ...(admin ?? [])]
    .map((l) => l.href)
    .filter((h) => path.startsWith(h))
    .sort((a, b) => b.length - a.length)[0];
  const biz = useSearchParams().get("biz");
  const nav = useRef<HTMLElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  // The studio reaches the request form through the create button; a manager has it as a section.
  const skip = (l: Link) => canCreate && l.href === "/portal";

  useEffect(() => {
    const bar = nav.current?.closest<HTMLElement>(".bar");
    if (!bar || !editable) return;
    function open(e: MouseEvent) {
      // Only where the sidebar is showing (not the phone's top bar), and not over a text field.
      if (!matchMedia("(min-width: 701px)").matches || (e.target as HTMLElement).closest("input, textarea")) return;
      e.preventDefault();
      // Kept on screen when opened near the bottom or right edge.
      setMenu({ x: Math.min(e.clientX, innerWidth - 180), y: Math.min(e.clientY, innerHeight - 56) });
    }
    bar.addEventListener("contextmenu", open);
    return () => bar.removeEventListener("contextmenu", open);
  }, [editable]);

  useEffect(() => {
    if (!menu && !editing) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(null);
      setEditing(false);
    };
    const close = () => setMenu(null);
    window.addEventListener("keydown", key);
    if (menu) {
      window.addEventListener("pointerdown", close);
      window.addEventListener("blur", close);
    }
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [menu, editing]);
  return (
    <>
      {canCreate && (
        <>
        <button type="button" className="rail-new" onClick={openCreate} aria-label="Create new" title="Create new (N)" data-tour="new" aria-haspopup="dialog">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span className="rail-label">New</span>
        </button>
        <button type="button" className="rail-search" onClick={openSearch} aria-label="Search" title="Search (S)" aria-haspopup="dialog">
          <SearchIcon />
          <span className="rail-label">Search</span>
        </button>
        </>
      )}
      {newHref && (
        <>
          <Link href={newHref} className="rail-new" aria-label="New request" title="New request">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            <span className="rail-label">New request</span>
          </Link>
          <button type="button" className="rail-search" onClick={openSearch} aria-label="Search" title="Search (S)" aria-haspopup="dialog">
            <SearchIcon />
            <span className="rail-label">Search</span>
          </button>
        </>
      )}
      {/* The sections, the Admin section and the clients scroll together when they don't fit. */}
      <div className="rail-scroll">
        {editing ? (
          <SidebarEdit all={all} hidden={hidden} admin={admin} pages={pages} skip={skip} onDone={() => setEditing(false)} />
        ) : (
          <>
            <nav className="rail-nav" aria-label="Sections" ref={nav}>
              {links
                .filter((l) => !skip(l))
                .map((l) => (
                  <Link key={l.href} href={l.href} aria-current={l.href === current ? "page" : undefined} aria-label={l.label} title={l.label}>
                    <NavIcon href={l.icon ?? l.href} strokeWidth={1.7} />
                    <span className="rail-label">{l.label}</span>
                  </Link>
                ))}
            </nav>
            {admin && (
              <nav className="rail-nav rail-admin" aria-label="Admin">
                <button type="button" className="rail-admin-head" onClick={foldAdmin} aria-expanded={adminOpen} title={adminOpen ? "Fold the Admin section" : "Open the Admin section"}>
                  <NavIcon href="/admin" strokeWidth={1.7} />
                  <span className="rail-label">Admin</span>
                  <svg className="rail-fold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                {adminOpen &&
                  admin.map((l) => (
                    <Link key={l.href} href={l.href} aria-current={l.href === current ? "page" : undefined} aria-label={l.label} title={l.label}>
                      <NavIcon href={l.icon ?? l.href} strokeWidth={1.7} />
                      <span className="rail-label">{l.label}</span>
                    </Link>
                  ))}
              </nav>
            )}
          </>
        )}
        {canCreate && clients.length > 0 && !editing && (
          <nav className="rail-clients" aria-label="Clients">
            <div className="rail-head">Clients</div>
            {clients.map((b) => (
              <Link key={b.id} href={`/queue?view=list&biz=${b.slug}`} aria-current={path === "/queue" && biz === b.slug ? "page" : undefined}>
                <BizBadge biz={b} size={18} />
                <span className="rail-label">{b.name}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>
      {menu && (
        <div className="ctx-menu" role="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" role="menuitem" autoFocus onClick={() => { setMenu(null); setEditing(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h10M4 12h16M4 17h7" /><path d="M17 4v6M14 7h6" /></svg>
            Edit sidebar
          </button>
        </div>
      )}
    </>
  );
}
