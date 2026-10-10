import Link from "next/link";
import { signOut } from "@/app/actions";
import { brandFor, brandThemeCss } from "@/lib/brands";
import type { Business, Member, Workspace } from "@/lib/types";
import BizBadge from "./BizBadge";
import NavLinks from "./NavLinks";
import { OatcakeMark } from "./OatcakeLogo";
import ThemeToggle from "./ThemeToggle";

function linksFor(member: Member, workspace: Workspace) {
  if (member.role === "manager") return [{ href: "/overview", label: "Overview" }];
  if (member.role === "client") return [{ href: "/portal", label: "Requests" }];
  if (workspace.kind === "trade")
    return [
      { href: "/queue", label: "Jobs" },
      { href: "/overview", label: "Overview" },
      { href: "/portal", label: "New job" },
      { href: "/customers", label: "Customers" },
      { href: "/personal", label: "Personal" },
    ];
  return [
    { href: "/queue", label: "Queue" },
    { href: "/overview", label: "Overview" },
    { href: "/portal", label: "New request" },
    { href: "/people", label: "People" },
    { href: "/personal", label: "Personal" },
  ];
}

export default function Shell({
  member,
  businesses,
  workspace,
  isAdmin = false,
  children,
}: {
  member: Member;
  businesses: Business[];
  workspace: Workspace;
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  // Clients see their own business's identity; the workspace owner and manager see Oatcake.
  const biz = member.role === "client" ? businesses.find((b) => b.id === member.business_id) : undefined;
  const brand = biz ? brandFor(biz) : undefined;

  return (
    <div className={brand ? "brand-theme" : undefined}>
      {brand && <style>{brandThemeCss(".brand-theme", brand)}</style>}
      <header className="bar">
        <div className="bar-in">
          {biz ? (
            <Link href="/" className="client-brand">
              <BizBadge biz={biz} size={34} wide />
              <span>
                Design requests
                <small>by Oatcake</small>
              </span>
            </Link>
          ) : (
            <Link href="/" className="brand" aria-label="Oatcake">
              <OatcakeMark height={22} />
            </Link>
          )}
          <NavLinks links={linksFor(member, workspace)} />
          <form action={signOut} className="who">
            <Link href="/account">{member.full_name || member.email}</Link>
            {member.role === "designer" && <Link href="/settings">Settings</Link>}
            {isAdmin && <Link href="/admin">Admin</Link>}
            <button className="link" type="submit">Sign out</button>
          </form>
          <ThemeToggle />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
