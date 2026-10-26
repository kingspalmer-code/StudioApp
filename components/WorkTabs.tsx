"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref } from "@/lib/menu";

// The strip along the top of the pages under Work (jobs, overview, clients, filing, gallery, team),
// so the business side is one button in the menu and one tap between its pages. Only shows on
// those pages; a job's own page and the quote editor keep the whole screen.
export default function WorkTabs({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const current = activeHref(links, path);
  if (links.length < 2 || !current || links.every((l) => l.href !== path)) return null;
  return (
    <nav className="seg work-tabs" aria-label="Work">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.href === current ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
