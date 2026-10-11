"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { openCreate } from "./CreateMenu";
import { NavIcon } from "./NavIcons";

// The section links as an iPhone-style tab bar along the bottom. Only shown on phones; bigger
// screens have the sidebar rail. The middle button opens the create sheet.
export default function TabBar({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  if (links.length < 2) return null;
  return (
    <nav className="tabbar" aria-label="Sections">
      {links.map((l) =>
        l.href === "/portal" ? (
          <button key={l.href} type="button" className="add" onClick={openCreate} data-tour="new" aria-haspopup="dialog">
            <NavIcon href={l.href} strokeWidth={2.4} />
            <span>New</span>
          </button>
        ) : (
          <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>
            <NavIcon href={l.href} />
            <span>{l.label}</span>
          </Link>
        )
      )}
    </nav>
  );
}
