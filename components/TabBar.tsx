"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { openCreate } from "./panel-events";
import { NavIcon } from "./NavIcons";
import { activeHref } from "@/lib/menu";

type TabLink = { href: string; label: string; icon?: string; match?: string[] };

// The section links as an iPhone-style tab bar along the bottom. Only shown on phones; bigger
// screens have the sidebar rail. The middle button opens the create sheet, and the sections that
// don't fit wait under More, which opens a short list from the bottom.
export default function TabBar({ links, more = [], canCreate = true }: { links: TabLink[]; more?: TabLink[]; canCreate?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  if (links.length + more.length < 2) return null;
  const current = activeHref([...links, ...more], path);
  const inMore = more.some((l) => l.href === current);
  return (
    <>
      <nav className="tabbar" aria-label="Sections">
        {links.map((l) =>
          l.href === "/portal" && canCreate ? (
            <button key={l.href} type="button" className="add" onClick={openCreate} data-tour="new" aria-haspopup="dialog">
              <NavIcon href={l.href} strokeWidth={2.4} />
              <span>New</span>
            </button>
          ) : (
            <Link key={l.href} href={l.href} aria-current={l.href === current ? "page" : undefined}>
              <NavIcon href={l.icon ?? l.href} />
              <span>{l.label}</span>
            </Link>
          )
        )}
        {more.length > 0 && (
          <button type="button" className={inMore ? "more on" : "more"} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01" /></svg>
            <span>More</span>
          </button>
        )}
      </nav>
      {open && (
        <div className="more-layer" role="dialog" aria-label="More">
          <div className="more-scrim" onClick={() => setOpen(false)} />
          <div className="more-panel">
            <div className="ct-grab" />
            {more.map((l) => (
              <Link key={l.href} href={l.href} aria-current={l.href === current ? "page" : undefined} onClick={() => setOpen(false)}>
                <NavIcon href={l.icon ?? l.href} />
                <span>{l.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
