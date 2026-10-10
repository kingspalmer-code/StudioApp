import Link from "next/link";
import { signOut } from "@/app/actions";
import { stopViewing } from "@/app/admin/actions";
import { brandFor, brandThemeCss } from "@/lib/brands";
import type { Business, Member, Workspace } from "@/lib/types";
import AskOatcake from "./AskOatcake";
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
  avatar = null,
  initials = "",
  askHint = false,
  askOpens = 0,
  askSince = 0,
  children,
}: {
  member: Member;
  businesses: Business[];
  workspace: Workspace;
  isAdmin?: boolean;
  viewing?: boolean;
  avatar?: string | null;
  initials?: string;
  askHint?: boolean;
  askOpens?: number;
  askSince?: number;
  children: React.ReactNode;
}) {
  // Clients see their own business's identity; the workspace owner and manager see Oatcake.
  const biz = member.role === "client" ? businesses.find((b) => b.id === member.business_id) : undefined;
  const brand = biz ? brandFor(biz) : undefined;
  const links = linksFor(member, workspace, viewing);

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
            {member.role === "designer" && <Link href="/settings" data-tour="settings">Settings</Link>}
            {isAdmin && <Link href="/admin">Admin</Link>}
            <button className="link" type="submit">Sign out</button>
          </form>
          <ThemeToggle />
          {member.role === "designer" && !viewing && process.env.ANTHROPIC_API_KEY && <AskOatcake hint={askHint} opens={askOpens} since={askSince} />}
          {/* Your photo or initials, opening your account. On phones the account links and theme switch live there too. */}
          <Link href="/account" className="me-btn" aria-label="Your account and settings" data-tour="me">
            {avatar ? <img src={avatar} alt="" /> : initials}
          </Link>
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
