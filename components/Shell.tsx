import Link from "next/link";
import { stopViewing } from "@/app/admin/actions";
import { startPreview, stopPreview } from "@/app/actions";
import { brandFor, brandThemeCss } from "@/lib/brands";
import type { Business, Member, Workspace } from "@/lib/types";
import AskOatcake from "./AskOatcake";
import BizBadge from "./BizBadge";
import AppBar from "./AppBar";
import Bell from "./Bell";
import CreateMenu from "./CreateMenu";
import NavLinks from "./NavLinks";
import RailGrip from "./RailGrip";
import RailNav from "./RailNav";
import Search from "./Search";
import SearchButton from "./SearchButton";
import TabBar from "./TabBar";
import Tracker from "./Tracker";
import { OatcakeMark } from "./OatcakeLogo";
import { termsFor } from "@/lib/workspace";
import { alwaysOnComputer } from "@/lib/menu";
import Submit from "@/components/Submit";

export type NavLink = { href: string; label: string; icon?: string };

export function linksFor(member: Member, workspace: Workspace, viewing: boolean): NavLink[] {
  const terms = termsFor(workspace.kind);
  const main = { href: "/queue", label: workspace.kind === "studio" ? "Queue" : terms.Jobs };
  // Managers can look at the queue, every job in it and the gallery of finished work; nothing there lets them change anything.
  // Managers linked to businesses on the People page can also send requests for them.
  if (member.role === "manager")
    return [
      main,
      { href: "/overview", label: "Overview" },
      { href: "/gallery", label: "Gallery" },
      { href: "/apps", label: "Apps" },
      ...(member.business_ids?.length && !viewing ? [{ href: "/portal", label: "New request" }] : []),
    ];
  // Clients get a sidebar like the studio's: their Overview (with the widgets) first, then their
  // requests, and Apps (theirs, or a way to ask for one).
  if (member.role === "client")
    return [
      { href: "/overview", label: "Overview" },
      { href: "/portal", label: "Requests", icon: "requests" },
      { href: "/apps", label: "Apps" },
    ];
  // Employees see the to-do list the owner sets them, and Apps.
  if (member.role === "staff") return [{ href: "/tasks", label: "To-do" }, { href: "/apps", label: "Apps" }];
  // Who the work is for: businesses (with their staff) on People, customers on Customers, and nobody when working alone.
  const clients =
    workspace.kind === "studio" ? [{ href: "/people", label: "People" }]
    : workspace.kind === "trade" ? [{ href: "/customers", label: "Customers" }]
    : [{ href: "/gallery", label: "Gallery" }];
  // Settings is a section of its own, last, so it's always a click away (it used to hide behind your account).
  const settings = { href: "/settings", label: "Settings" };
  if (viewing) return [main, { href: "/overview", label: "Overview" }, ...clients, { href: "/apps", label: "Apps" }, settings];
  return [
    main,
    { href: "/overview", label: "Overview" },
    { href: "/portal", label: `New ${terms.job}` },
    ...clients,
    // Tools made for one client each, such as a pattern recolourer, and a way to ask for new ones.
    { href: "/apps", label: "Apps" },
    { href: "/team", label: "Team" },
    { href: "/personal", label: "Personal" },
    settings,
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
  hidden = { phone: [], computer: [] },
  preview,
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
  // Menu buttons the owner switched off in Settings > Menu, by href.
  hidden?: { phone: string[]; computer: string[] };
  preview?: Business;
  children: React.ReactNode;
}) {
  // Clients see their own business's identity; the workspace owner and manager see Oatcake.
  const biz = member.role === "client" ? businesses.find((b) => b.id === member.business_id) : undefined;
  const brand = biz ? brandFor(biz) : undefined;
  const links = linksFor(member, workspace, viewing);
  // Anyone with more than one section gets the sidebar rail on bigger screens (the tab bar on phones).
  const rail = links.length > 1;
  // The sidebar and the phone tab bar leave out what the owner has switched off. The first section
  // always stays, and on computers Settings does too.
  const deskLinks = links.filter((l, i) => alwaysOnComputer(l.href, i) || !hidden.computer.includes(l.href));
  const phoneLinks = links.filter((l, i) => i === 0 || !hidden.phone.includes(l.href));
  const canCreate = member.role === "designer" && !viewing;
  // Clients get New (their request form) and Search over their own requests too.
  const isClient = member.role === "client";
  const newHref = isClient ? "/portal?new=1" : undefined;
  const terms = termsFor(workspace.kind);

  return (
    <div className={[brand ? "brand-theme" : "", rail ? "has-rail" : ""].filter(Boolean).join(" ") || undefined}>
      {brand && <style>{brandThemeCss(".brand-theme", brand)}</style>}
      <AppBar links={links} canCreate={canCreate} bell={rail && !viewing && !preview} newHref={newHref} />
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
          {rail ? <RailNav links={deskLinks} canCreate={canCreate} clients={businesses} newHref={newHref} /> : <NavLinks links={links} />}
          {(canCreate || isClient) && <SearchButton />}
          {member.role === "designer" && !viewing && process.env.ANTHROPIC_API_KEY && <AskOatcake hint={askHint} opens={askOpens} since={askSince} />}
          {/* What other people have done on your jobs. Top right of the page, whatever the layout. */}
          {!viewing && !preview && <Bell />}
          {/* Previewing a client: their bell is shown, but it's the client's, so it doesn't open. */}
          {preview && (
            <span className="bell-btn" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            </span>
          )}
          {/* Your photo or initials, opening your account: settings, appearance and sign out live there, so the bar stays calm. */}
          <Link href="/account" className="me-btn" aria-label={helpUnread ? "Your account. New reply from Oatcake" : "Your account and settings"} data-tour="me">
            {avatar ? <img src={avatar} alt="" /> : initials}
            {helpUnread && <span className="me-dot" />}
          </Link>
        </div>
        {rail && <RailGrip />}
      </header>
      {viewing && (
        <form action={stopViewing} className="viewing-bar">
          <span>
            Viewing <b>{workspace.name}</b>{workspace.owner_name ? ` (${workspace.owner_name})` : ""}. Read-only.
          </span>
          <Submit className="btn small" type="submit">Back to my workspace</Submit>
        </form>
      )}
      {preview && (
        <div className="viewing-bar preview-bar">
          <span>
            Previewing what <b>{preview.name}</b> sees. Nothing can be changed here.
          </span>
          <span className="preview-actions">
            {businesses.length > 1 && (
              <form action={startPreview} className="preview-switch">
                <select name="business" defaultValue={preview.id} aria-label="Preview another client">
                  {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <Submit className="link" type="submit">Switch</Submit>
              </form>
            )}
            <form action={stopPreview}>
              <Submit className="btn small" type="submit">Exit preview</Submit>
            </form>
          </span>
        </div>
      )}
      <main className={links.length > 1 ? "has-tabbar" : undefined}>
        {viewing || preview ? (
          <fieldset disabled className="read-only">
            {children}
          </fieldset>
        ) : (
          children
        )}
      </main>
      <TabBar links={phoneLinks} canCreate={canCreate} />
      {canCreate && (
        <CreateMenu
          kind={workspace.kind}
          Job={terms.Job}
          Client={terms.Client}
          clientNames={Object.fromEntries(businesses.map((b) => [b.id, b.name]))}
        />
      )}
      {isClient && (
        <Search
          kind={workspace.kind}
          Job="Request"
          Client={terms.Client}
          clients={(member.business_ids ?? []).map((id) => businesses.find((b) => b.id === id)).filter((b) => b !== undefined).map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
          client={{ apps: Boolean(member.has_apps) }}
        />
      )}
      {canCreate && (
        <Search
          kind={workspace.kind}
          Job={terms.Job}
          Client={terms.Client}
          clients={businesses.map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
        />
      )}
      {track && !viewing && !preview && <Tracker />}
    </div>
  );
}
