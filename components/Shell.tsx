import Link from "next/link";
import { stopViewing } from "@/app/admin/actions";
import { brandFor, brandThemeCss } from "@/lib/brands";
import type { Business, Member, Workspace } from "@/lib/types";
import AskOatcake from "./AskOatcake";
import BizBadge from "./BizBadge";
import CreateMenu from "./CreateMenu";
import NavLinks from "./NavLinks";
import RailNav from "./RailNav";
import Search from "./Search";
import SearchButton from "./SearchButton";
import TabBar from "./TabBar";
import Tracker from "./Tracker";
import { OatcakeMark } from "./OatcakeLogo";
import { termsFor } from "@/lib/workspace";

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
  viewing = false,
  avatar = null,
  initials = "",
  askHint = false,
  askOpens = 0,
  askSince = 0,
  helpUnread = false,
  track = false,
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
  helpUnread?: boolean;
  track?: boolean;
  children: React.ReactNode;
}) {
  // Clients see their own business's identity; the workspace owner and manager see Oatcake.
  const biz = member.role === "client" ? businesses.find((b) => b.id === member.business_id) : undefined;
  const brand = biz ? brandFor(biz) : undefined;
  const links = linksFor(member, workspace, viewing);
  // Anyone with more than one section gets the sidebar rail on bigger screens (the tab bar on phones).
  const rail = links.length > 1;
  const canCreate = member.role === "designer" && !viewing;
  const terms = termsFor(workspace.kind);

  return (
    <div className={[brand ? "brand-theme" : "", rail ? "has-rail" : ""].filter(Boolean).join(" ") || undefined}>
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
          {rail ? <RailNav links={links} canCreate={canCreate} /> : <NavLinks links={links} />}
          {canCreate && <SearchButton />}
          {member.role === "designer" && !viewing && process.env.ANTHROPIC_API_KEY && <AskOatcake hint={askHint} opens={askOpens} since={askSince} />}
          {/* Your photo or initials, opening your account: settings, appearance and sign out live there, so the bar stays calm. */}
          <Link href="/account" className="me-btn" aria-label={helpUnread ? "Your account. New reply from Oatcake" : "Your account and settings"} data-tour="me">
            {avatar ? <img src={avatar} alt="" /> : initials}
            {helpUnread && <span className="me-dot" />}
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
      {canCreate && (
        <CreateMenu
          trade={workspace.kind === "trade"}
          Job={terms.Job}
          Client={terms.Client}
          clientNames={Object.fromEntries(businesses.map((b) => [b.id, b.name]))}
        />
      )}
      {canCreate && (
        <Search
          trade={workspace.kind === "trade"}
          Job={terms.Job}
          Client={terms.Client}
          clients={businesses.map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
        />
      )}
      {track && !viewing && <Tracker />}
    </div>
  );
}
