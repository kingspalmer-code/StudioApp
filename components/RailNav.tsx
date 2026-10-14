"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Business } from "@/lib/types";
import BizBadge from "./BizBadge";
import { openCreate } from "./CreateMenu";
import { NavIcon } from "./NavIcons";
import { openSearch } from "./Search";

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
export default function RailNav({ links, canCreate, clients = [], newHref }: { links: { href: string; label: string; icon?: string }[]; canCreate: boolean; clients?: Business[]; newHref?: string }) {
  const path = usePathname();
  const biz = useSearchParams().get("biz");
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
      <nav className="rail-nav" aria-label="Sections">
        {links
          // The studio reaches the request form through the create button; a manager has it as a section.
          .filter((l) => !canCreate || l.href !== "/portal")
          .map((l) => (
            <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined} aria-label={l.label} title={l.label}>
              <NavIcon href={l.icon ?? l.href} strokeWidth={1.7} />
              <span className="rail-label">{l.label}</span>
            </Link>
          ))}
      </nav>
      {canCreate && clients.length > 0 && (
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
    </>
  );
}
