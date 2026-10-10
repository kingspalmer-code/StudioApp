import Link from "next/link";
import { signOut } from "@/app/actions";
import { stopViewing } from "@/app/admin/actions";
import { brandFor, brandThemeCss } from "@/lib/brands";
import type { Business, Member, Workspace } from "@/lib/types";
import BizBadge from "./BizBadge";
import NavLinks from "./NavLinks";
import TabBar from "./TabBar";
import { OatcakeMark } from "./OatcakeLogo";
import ThemeToggle from "./ThemeToggle";

function linksFor(member: Member, workspace: Workspace, viewing: boolean) {
  if (member.role === "manager") return [{ href: "/overview", label: "Overview" }];
  if (member.role === "client") return [{ href: "/portal", label: "Requests" }];
  if (viewing)
    return [
      { href: "/queue", label: workspace.kind === "trade" ? "Jobs" : "Queue" },
      { href: "/overview", label: "Overview" },
      ...(workspace.kind === "trade" ? [{ href: "/customers", label: "Customers" }] : [{ href: "/people", label: "People" }]),
    ];
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
  viewing = false,
  children,
}: {
  member: Member;
  businesses: Business[];
  workspace: Workspace;
  isAdmin?: boolean;
  viewing?: boolean;
  children: React.ReactNode;
}) {
  // Clients see their own business's identity; the workspace owner and manager see Oatcake.
  const biz = member.role === "client" ? businesses.find((b) => b.id === member.business_id) : undefined;
  const brand = biz ? brandFor(biz) : undefined;
  const links = linksFor(member, workspace, viewing);
  const initials = (member.full_name || member.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

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
          <NavLinks links={links} />
          <form action={signOut} className="who">
            <Link href="/account">{member.full_name || member.email}</Link>
            {member.role === "designer" && <Link href="/settings" data-tour="settings">Settings</Link>}
            {isAdmin && <Link href="/admin">Admin</Link>}
            <button className="link" type="submit">Sign out</button>
          </form>
          <ThemeToggle />
          {/* On phones the account links and theme switch live on the account page instead. */}
          <Link href="/account" className="me-btn" aria-label="Your account and settings" data-tour="me">{initials}</Link>
        </div>
      </header>
      {viewing && (
        <form action={stopViewing} className="viewing-bar">
          <span>
            Viewing <b>{workspace.name}</b>{workspace.owner_name ? ` (${workspace.owner_name})` : ""}. Read-only.
          </span>
          <button className="btn small" type="submit">Back to my workspace</button>
        </form>
      )}
      <main className={links.length > 1 ? "has-tabbar" : undefined}>
        {viewing ? (
          <fieldset disabled className="read-only">
            {children}
          </fieldset>
        ) : (
          children
        )}
      </main>
      <TabBar links={links} />
    </div>
  );
}
