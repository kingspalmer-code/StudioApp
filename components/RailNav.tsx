"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { openCreate } from "./CreateMenu";
import { NavIcon } from "./NavIcons";

// On iPad and desktop the top bar becomes a slim rail down the left: a create button, then the
// sections as icons. Labels show as tooltips and to screen readers.
export default function RailNav({ links, canCreate }: { links: { href: string; label: string }[]; canCreate: boolean }) {
  const path = usePathname();
  return (
    <>
      {canCreate && (
        <button type="button" className="rail-new" onClick={openCreate} aria-label="Create new" title="Create new (N)" data-tour="new" aria-haspopup="dialog">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}
      <nav className="rail-nav" aria-label="Sections">
        {links
          .filter((l) => l.href !== "/portal")
          .map((l) => (
            <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined} aria-label={l.label} title={l.label}>
              <NavIcon href={l.href} strokeWidth={1.7} />
            </Link>
          ))}
      </nav>
    </>
  );
}
