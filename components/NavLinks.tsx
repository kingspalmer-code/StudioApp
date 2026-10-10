"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  if (links.length < 2) return null;
  return (
    <nav className="seg" aria-label="Sections">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined} data-tour={l.href === "/portal" ? "new" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
