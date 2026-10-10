"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The section links as an iPhone-style tab bar along the bottom. Only shown on phones; bigger
// screens keep the links in the top bar.
const ICONS: Record<string, React.ReactNode> = {
  "/queue": <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  "/overview": <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  "/portal": <path d="M12 5v14M5 12h14" />,
  "/customers": <path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7" />,
  "/personal": <path d="M9 11l2.5 2.5L16 9M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
};
ICONS["/people"] = ICONS["/customers"];

export default function TabBar({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  if (links.length < 2) return null;
  return (
    <nav className="tabbar" aria-label="Sections">
      {links.map((l) => {
        const on = path.startsWith(l.href);
        const add = l.href === "/portal";
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined} className={add ? "add" : undefined} data-tour={add ? "new" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={add ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ICONS[l.href]}
            </svg>
            <span>{add ? "New" : l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
