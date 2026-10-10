import Link from "next/link";
import { signOut } from "@/app/actions";
import { brandFor } from "@/lib/brands";
import type { Business, Member } from "@/lib/types";
import BizBadge from "./BizBadge";
import NavLinks from "./NavLinks";

const LINKS = {
  designer: [
    { href: "/queue", label: "Queue" },
    { href: "/overview", label: "Overview" },
    { href: "/portal", label: "New request" },
    { href: "/people", label: "People" },
  ],
  manager: [{ href: "/overview", label: "Overview" }],
  client: [{ href: "/portal", label: "Requests" }],
};

export default function Shell({
  member,
  businesses,
  children,
}: {
  member: Member;
  businesses: Business[];
  children: React.ReactNode;
}) {
  // Clients see their own business's identity; Kingsley and the manager see the neutral studio.
  const biz = member.role === "client" ? businesses.find((b) => b.id === member.business_id) : undefined;
  const brand = biz ? brandFor(biz) : undefined;
  const theme = brand ? ({ "--accent": brand.color, "--accent-ink": brand.ink } as React.CSSProperties) : undefined;

  return (
    <div style={theme}>
      <header className="bar">
        <div className="bar-in">
          {biz ? (
            <Link href="/" className="client-brand">
              <BizBadge biz={biz} size={30} />
              <span>
                {biz.name}
                <small>Design requests · by Studio Desk</small>
              </span>
            </Link>
          ) : (
            <Link href="/" className="brand">
              <i aria-hidden="true" />
              Studio Desk
            </Link>
          )}
          <NavLinks links={LINKS[member.role]} />
          <form action={signOut} className="who">
            <Link href="/account">{member.full_name || member.email}</Link>
            <button className="link" type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
