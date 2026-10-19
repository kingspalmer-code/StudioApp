import Link from "next/link";
import { stopViewing } from "@/app/admin/actions";
import { startPreview, stopPreview } from "@/app/actions";
import { brandFor, brandThemeCss } from "@/lib/brands";
import type { Business, Member, Workspace } from "@/lib/types";
import AskOatcake from "./AskOatcake";
import BizBadge from "./BizBadge";
import AppBar from "./AppBar";
import Bell from "./Bell";
import NavLinks from "./NavLinks";
import RailGrip from "./RailGrip";
import RailNav from "./RailNav";
import { LazyCreateMenu as CreateMenu, LazySearch as Search } from "./LazyPanels";
import SearchButton from "./SearchButton";
import TabBar from "./TabBar";
import Tracker from "./Tracker";
import { OatcakeMark } from "./OatcakeLogo";
import { termsFor } from "@/lib/workspace";
import { alwaysOnComputer, onPhoneTab, ordered } from "@/lib/menu";
import Submit from "@/components/Submit";
import { allows } from "@/lib/access";

export type NavLink = { href: string; label: string; icon?: string; fixed?: boolean };

export function linksFor(member: Member, workspace: Workspace, viewing: boolean): NavLink[] {
  const terms = termsFor(workspace.kind);
  const main = { href: "/queue", label: workspace.kind === "studio" ? "Queue" : terms.Jobs };
  // Managers can look at the queue, every job in it and the gallery of finished work; nothing there lets them change anything.
  // Managers linked to businesses on the People page can also send requests for them.
  // Every finished job, filed by month in a card drawer. After the first four, so it sits under More on phones.
  const filing = { href: "/filing", label: "Filing" };
  if (member.role === "manager")
    return [
      main,
      { href: "/overview", label: "Overview" },
      { href: "/gallery", label: "Gallery" },
      { href: "/apps", label: "Apps" },
      filing,
      ...(member.business_ids?.length && !viewing ? [{ href: "/portal", label: "New request" }] : []),
    ];
  // Clients get a sidebar like the studio's: their Overview (with the widgets) first, then their
  // requests, their gallery of finished work, and Apps (theirs, or a way to ask for one).
  if (member.role === "client")
    return [
      { href: "/overview", label: "Overview" },
      { href: "/portal", label: "Requests", icon: "requests" },
      { href: "/gallery", label: "Gallery" },
      { href: "/apps", label: "Apps" },
      filing,
    ];
  // Employees see the to-do list the owner sets them, and Apps, plus whatever else the owner let them into on Team.
  if (member.staff) {
    const a = member.access;
    const clients = workspace.kind === "studio" ? [{ href: "/people", label: "People" }] : workspace.kind === "trade" ? [{ href: "/customers", label: "Customers" }] : [];
    return [
      { href: "/tasks", label: "To-do" },
      { href: "/calendar", label: "Calendar" },
      ...(allows(a, "requests") ? [main, { href: "/overview", label: "Overview" }] : []),
      ...(allows(a, "requests", "edit") ? [{ href: "/portal", label: `New ${terms.job}` }] : []),
      ...(allows(a, "clients") ? clients : []),
      ...(allows(a, "requests") ? [{ href: "/gallery", label: "Gallery" }, filing] : []),
      { href: "/apps", label: "Apps" },
      ...(allows(a, "team") ? [{ href: "/team", label: "Team" }] : []),
      ...(allows(a, "settings") || allows(a, "quotes") ? [{ href: "/settings", label: "Settings" }] : []),
    ];
  }
  if (member.role === "staff") return [{ href: "/tasks", label: "To-do" }, { href: "/calendar", label: "Calendar" }, { href: "/apps", label: "Apps" }];
  // Who the work is for: businesses (with their staff) on People, customers on Customers, and nobody when working alone.
  const clients =
    workspace.kind === "studio" ? [{ href: "/people", label: "People" }]
    : workspace.kind === "trade" ? [{ href: "/customers", label: "Customers" }]
    : [];
  // Everyone who sees jobs gets the gallery of finished work.
  const gallery = { href: "/gallery", label: "Gallery" };
  // Settings is a section of its own, last, so it's always a click away (it used to hide behind your account).
  const settings = { href: "/settings", label: "Settings" };
  if (viewing) return [main, { href: "/overview", label: "Overview" }, ...clients, gallery, filing, { href: "/apps", label: "Apps" }, settings];
  return [
    main,
    { href: "/overview", label: "Overview" },
    { href: "/portal", label: `New ${terms.job}` },
    ...clients,
    gallery,
    filing,
    // Tools made for one client each, such as a pattern recolourer, and a way to ask for new ones.
    { href: "/apps", label: "Apps" },
    { href: "/team", label: "Team" },
    // A to-do list in priority order that fills a calendar, with reminders.
    { href: "/calendar", label: "Calendar" },
    { href: "/personal", label: "Personal" },
    settings,
  ];
}

export default function Shell({
  member,
  businesses,
  workspace,
  viewing = false,
  readOnly = false,
  avatar = null,
  initials = "",
  askHint = false,
  askOpens = 0,
  askSince = 0,
  helpUnread = false,
  track = false,
  hidden = { computer: [], order: [] },
  preview,
  children,
}: {
  member: Member;
  businesses: Business[];
  workspace: Workspace;
  isAdmin?: boolean;
  viewing?: boolean;
  // An employee who may only look at this part (see requireMember): the page shows, nothing changes.
  readOnly?: boolean;
  avatar?: string | null;
  initials?: string;
  askHint?: boolean;
  askOpens?: number;
  askSince?: number;
  helpUnread?: boolean;
  track?: boolean;
  // Menu buttons the owner switched off in Settings > Menu (or dragged out of the sidebar), by href,
  // the order they dragged the sidebar into, and the ones they picked for the phone tab bar.
  hidden?: { phoneTabs?: string[]; computer: string[]; order?: string[] };
  preview?: Business;
  children: React.ReactNode;
}) {
  // Clients see their own business's identity; the workspace owner and manager see Oatcake.
  const biz = member.role === "client" ? businesses.find((b) => b.id === member.business_id) : undefined;
  const brand = biz ? brandFor(biz) : undefined;
  const links = linksFor(member, workspace, viewing);
  // Anyone with more than one section gets the sidebar rail on bigger screens (the tab bar on phones).
  const rail = links.length > 1;
  // The sidebar leaves out what the owner has switched off. The first section always stays, and
  // Settings does too.
  // The sidebar is in the order the owner dragged it into; the ones that always stay are marked so
  // Edit sidebar won't let them be dragged out.
  const deskAll = ordered(links.map((l, i) => ({ ...l, fixed: alwaysOnComputer(l.href, i) })), hidden.order);
  const deskLinks = deskAll.filter((l) => l.fixed || !hidden.computer.includes(l.href));
  // On phones the first few sit on the tab bar and the rest under More.
  const phoneLinks = links.filter((l, i) => onPhoneTab(l.href, i, hidden.phoneTabs));
  const moreLinks = links.filter((l, i) => !onPhoneTab(l.href, i, hidden.phoneTabs));
  const canCreate = member.role === "designer" && !viewing && (!member.staff || allows(member.access, "requests", "edit"));
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
          {rail ? <RailNav links={deskLinks} all={deskAll} hidden={hidden.computer} editable={!viewing && !preview} canCreate={canCreate} clients={businesses} newHref={newHref} /> : <NavLinks links={links} />}
          {(canCreate || isClient) && <SearchButton />}
          {member.role === "designer" && !member.staff && !viewing && process.env.ANTHROPIC_API_KEY && <AskOatcake hint={askHint} opens={askOpens} since={askSince} />}
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
      {readOnly && !viewing && (
        <div className="viewing-bar">
          <span>You can look at this but not change it. {workspace.owner_name || "The owner"} can change that on Team.</span>
        </div>
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
        {viewing || preview || readOnly ? (
          <fieldset disabled className="read-only">
            {children}
          </fieldset>
        ) : (
          children
        )}
      </main>
      <TabBar links={phoneLinks} more={moreLinks} canCreate={canCreate} />
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
