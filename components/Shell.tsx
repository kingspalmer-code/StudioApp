import Link from "next/link";
import { stopViewing } from "@/app/admin/actions";
import { startPreview, stopPreview } from "@/app/actions";
import { brandFor, brandThemeCss } from "@/lib/brands";
import type { Business, Member, Workspace } from "@/lib/types";
import AskOatcake from "./AskOatcake";
import BizBadge from "./BizBadge";
import AppBar from "./AppBar";
import Bell from "./Bell";
import type { BoxStyle } from "@/lib/palette";
import Colours from "./Colours";
import NavLinks from "./NavLinks";
import RailGrip from "./RailGrip";
import RailNav from "./RailNav";
import { LazyCreateMenu as CreateMenu, LazySearch as Search } from "./LazyPanels";
import SearchButton from "./SearchButton";
import TabBar from "./TabBar";
import Tracker from "./Tracker";
import { OatcakeMark } from "./OatcakeLogo";
import { jobsPage, termsFor } from "@/lib/workspace";
import { alwaysOnComputer, onPhoneTab, ordered, WORK_PREFIXES, type HomeMode } from "@/lib/menu";
import NewHome from "./NewHome";
import WorkTabs from "./WorkTabs";
import Submit from "@/components/Submit";
import { allows } from "@/lib/access";

export type NavLink = { href: string; label: string; icon?: string; fixed?: boolean; match?: string[] };

// Every other page someone can open, grouped the way the app groups them, so Edit sidebar can pin
// any of them (menu_pins). Only pages this login may open are offered, and a pin to anything not
// on this list is ignored, so nobody can pin their way into a page they can't see.
export const ADMIN_PAGES: NavLink[] = [
  { href: "/admin", label: "Admin overview" },
  { href: "/admin/people", label: "All people" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/workspaces", label: "Workspaces" },
];

export function pagesFor(member: Member, workspace: Workspace, viewing: boolean, isAdmin: boolean, mode: HomeMode = "life"): { title: string; links: NavLink[] }[] {
  const terms = termsFor(workspace.kind);
  const owner = member.role === "designer" && !member.staff;
  const a = member.access;
  const settings = owner || (member.staff && (allows(a, "settings") || allows(a, "quotes")));
  const parts = owner || allows(a, "settings");
  const icon = "/settings";
  return [
    // The business side's own pages, so any of them can be pinned straight onto the sidebar. With
    // "Just work" they're all in the menu already, and Today and Habits wait here instead.
    { title: "Work", links: (owner && mode === "life") || member.staff ? workLinks(member, workspace).filter((l) => l.href !== "/queue") : [] },
    { title: "Life", links: owner && mode === "work" ? [{ href: "/today", label: "Today" }, { href: "/habits", label: "Habits" }] : [] },
    {
      title: "Settings",
      links: settings
        ? [
            ...(parts ? [{ href: "/settings/workspace", label: "Workspace", icon }] : []),
            ...(viewing ? [] : [{ href: "/settings/menu", label: "Menu", icon }]),
            ...(parts && workspace.kind === "trade" ? [{ href: "/settings/request-link", label: "Request link", icon }] : []),
            ...(parts ? [{ href: "/settings/form", label: `${terms.Job} form`, icon }] : []),
            ...(owner || allows(a, "quotes") ? [{ href: "/settings/documents", label: "Quotes & invoices", icon }] : []),
            ...(parts ? [{ href: "/settings/stages", label: "Stages", icon }, { href: "/settings/types", label: `${terms.Job} types`, icon }] : []),
          ]
        : [],
    },
    {
      title: "Apps",
      links: [
        { href: "/apps/3d-viewer", label: "3D viewer" },
        ...(owner || allows(a, "requests") ? [{ href: "/apps/job-time", label: "Job time calculator" }] : []),
      ],
    },
    {
      title: "You",
      links: [
        { href: "/account", label: "Account" },
        ...(viewing ? [] : [{ href: "/notifications", label: "Notifications" }]),
        { href: "/help", label: "Help" },
      ],
    },
    { title: "Admin", links: isAdmin && !viewing ? ADMIN_PAGES : [] },
  ].filter((g) => g.links.length > 0);
}

export function linksFor(member: Member, workspace: Workspace, viewing: boolean, mode: HomeMode = "life"): NavLink[] {
  const terms = termsFor(workspace.kind);
  const main = { href: "/queue", label: jobsPage(workspace.kind) };
  // Managers can look at the queue, every job in it and the gallery of finished work; nothing there lets them change anything.
  // Managers linked to businesses on the People page can also send requests for them.
  // Every finished job, filed by month in a card drawer. After the first four, so it sits under More on phones.
  const filing = { href: "/filing", label: "Filing" };
  // The one place for to-dos: a list in priority order beside the calendar it fills. Employees also
  // find the tasks the owner set them there. (It lives at /calendar so saved menus still find it.)
  const todo = { href: "/calendar", label: "To-do" };
  // Everyone's own habits, whatever kind of login.
  const habits = { href: "/habits", label: "Habits" };
  // The front door: what's on today, somewhere to jot things down, today's habits and Pickle.
  const today = { href: "/today", label: "Today" };
  if (member.role === "manager")
    return [
      main,
      { href: "/overview", label: "Overview" },
      { href: "/gallery", label: "Gallery" },
      { href: "/apps", label: "Apps" },
      filing,
      habits,
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
      habits,
    ];
  // Employees start on Today too, with the to-do list the owner sets them, their habits and Apps,
  // plus Work if the owner let them into any of it on Team.
  if (member.staff) {
    const a = member.access;
    const work = workLinks(member, workspace);
    return [
      today,
      todo,
      ...(allows(a, "requests", "edit") ? [{ href: "/portal", label: `New ${terms.job}` }] : []),
      habits,
      ...(work.length ? [workButton(work)] : []),
      { href: "/apps", label: "Apps" },
      ...(allows(a, "settings") || allows(a, "quotes") ? [{ href: "/settings", label: "Settings" }] : []),
    ];
  }
  if (member.role === "staff") return [today, todo, habits, { href: "/apps", label: "Apps" }];
  // Settings is a section of its own, last, so it's always a click away (it used to hide behind your account).
  const settings = { href: "/settings", label: "Settings" };
  if (viewing) return [main, { href: "/overview", label: "Overview" }, ...clientsOf(workspace), { href: "/gallery", label: "Gallery" }, filing, { href: "/apps", label: "Apps" }, settings];
  // "Just work": the menu as it was before Today, for people who use Oatcake purely for client work.
  if (mode === "work")
    return [
      main,
      { href: "/overview", label: "Overview" },
      { href: "/portal", label: `New ${terms.job}` },
      ...clientsOf(workspace),
      todo,
      { href: "/gallery", label: "Gallery" },
      filing,
      { href: "/apps", label: "Apps" },
      { href: "/team", label: "Team" },
      settings,
    ];
  // The owner's sections follow the day: Today, To-do, the + (New on phones, which opens the
  // create sheet with somewhere to jot anything down), Habits, then Work, which holds the business
  // side (jobs, clients, finished work, the team) behind one button with a strip along the top.
  return [
    today,
    todo,
    { href: "/portal", label: `New ${terms.job}` },
    habits,
    workButton(workLinks(member, workspace)),
    // Tools made for one client each, such as a pattern recolourer, and a way to ask for new ones.
    { href: "/apps", label: "Apps" },
    settings,
  ];
}

// Who the work is for: businesses (with their staff) on People, customers on Customers, and nobody when working alone.
const clientsOf = (workspace: Workspace): NavLink[] =>
  workspace.kind === "studio" ? [{ href: "/people", label: "People" }]
  : workspace.kind === "trade" ? [{ href: "/customers", label: "Customers" }]
  : [];

// The pages under Work for this login, in the order its strip shows them. An employee only gets
// the ones the owner let them into on Team.
export function workLinks(member: Member, workspace: Workspace): NavLink[] {
  const owner = member.role === "designer" && !member.staff;
  const a = member.access;
  const jobs = owner || allows(a, "requests");
  return [
    ...(jobs ? [{ href: "/queue", label: jobsPage(workspace.kind) }, { href: "/overview", label: "Overview" }] : []),
    ...(owner || allows(a, "clients") ? clientsOf(workspace) : []),
    ...(jobs ? [{ href: "/filing", label: "Filing" }, { href: "/gallery", label: "Gallery" }] : []),
    ...(owner || allows(a, "team") ? [{ href: "/team", label: "Team" }] : []),
  ];
}

// The one Work button: it opens the first page under Work and stays lit on all of them.
const workButton = (work: NavLink[]): NavLink => ({ href: work[0]?.href ?? "/queue", label: "Work", icon: "work", match: WORK_PREFIXES });

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
  isAdmin = false,
  hidden = { computer: [], order: [] },
  palette = null,
  boxes = "raised",
  mode = "life",
  askMode = false,
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
  // the order they dragged the sidebar into, and the ones they picked for the phone tab bar. Pins are
  // other pages added to the sidebar, and admin what a platform admin keeps in their Admin section.
  hidden?: { phoneTabs?: string[]; computer: string[]; order?: string[]; pins?: string[]; admin?: string[] };
  // Their own colour theme (lib/palette.ts), or none for Oatcake's.
  palette?: string[] | null;
  // Whether boxes float above the page or sit pressed into it (Colours).
  boxes?: BoxStyle;
  // Today first or Jobs first (lib/menu.ts HomeMode), and whether to ask which, once.
  mode?: HomeMode;
  askMode?: boolean;
  preview?: Business;
  children: React.ReactNode;
}) {
  // Clients see their own business's identity; the workspace owner and manager see Oatcake.
  const biz = member.role === "client" ? businesses.find((b) => b.id === member.business_id) : undefined;
  const brand = biz ? brandFor(biz) : undefined;
  const links = linksFor(member, workspace, viewing, mode);
  // Anyone with more than one section gets the sidebar rail on bigger screens (the tab bar on phones).
  const rail = links.length > 1;
  // The sidebar leaves out what the owner has switched off. The first section always stays, and
  // Settings does too.
  // The sidebar is in the order the owner dragged it into; the ones that always stay are marked so
  // Edit sidebar won't let them be dragged out.
  // Pages pinned from further in (a Settings section, an app, an admin page) join the sections.
  const pages = viewing || preview ? [] : pagesFor(member, workspace, viewing, isAdmin, mode);
  const known = new Map([...links, ...pages.flatMap((g) => g.links)].map((l) => [l.href, l]));
  const pick = (hrefs: string[]) => [...new Set(hrefs)].map((h) => known.get(h)).filter((l) => l !== undefined);
  const pins = pick(hidden.pins ?? []).filter((l) => !links.includes(l));
  // A platform admin's own Admin section, under the sections: the admin pages to start with, then
  // whatever they drag in or out of it. Nobody else ever has one.
  const admin = isAdmin && !viewing && !preview ? pick(hidden.admin ?? ADMIN_PAGES.map((l) => l.href)) : [];
  const inAdmin = new Set(admin.map((l) => l.href));
  const deskAll = ordered([...links.map((l, i) => ({ ...l, fixed: alwaysOnComputer(l.href, i) })), ...pins.filter((l) => !inAdmin.has(l.href))], hidden.order);
  const deskLinks = deskAll.filter((l) => l.fixed || (!hidden.computer.includes(l.href) && !inAdmin.has(l.href)));
  // On phones the first few sit on the tab bar and the rest under More, with pinned pages and the
  // Admin section's pages at the end of More.
  const phoneLinks = links.filter((l, i) => onPhoneTab(l.href, i, hidden.phoneTabs));
  const moreLinks = [...links.filter((l, i) => !onPhoneTab(l.href, i, hidden.phoneTabs)), ...pins, ...admin.filter((l) => !links.includes(l) && !pins.includes(l))];
  const canCreate = member.role === "designer" && !viewing && (!member.staff || allows(member.access, "requests", "edit"));
  // Clients get New (their request form) and Search over their own requests too.
  const isClient = member.role === "client";
  const newHref = isClient ? "/portal?new=1" : undefined;
  const terms = termsFor(workspace.kind);
  // The strip along the top of the pages under Work.
  // "Just work" has every work page in the menu already, so no strip.
  const work = member.role === "designer" && !viewing && !preview && mode === "life" ? workLinks(member, workspace) : [];

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
          {rail ? <RailNav links={deskLinks} all={deskAll} hidden={hidden.computer} admin={isAdmin && !viewing && !preview ? admin : undefined} pages={pages} editable={!viewing && !preview} canCreate={canCreate} clients={businesses} newHref={newHref} /> : <NavLinks links={links} />}
          {(canCreate || isClient) && <SearchButton />}
          {member.role === "designer" && !member.staff && !viewing && process.env.ANTHROPIC_API_KEY && <AskOatcake hint={askHint} opens={askOpens} since={askSince} />}
          {/* One button to re-colour the whole app, from a dropped palette image or a preset. */}
          <Colours palette={palette} boxes={boxes} />
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
        {work.length > 1 && <WorkTabs links={work} />}
        {viewing || preview || readOnly ? (
          <fieldset disabled className="read-only">
            {children}
          </fieldset>
        ) : (
          children
        )}
      </main>
      <TabBar links={phoneLinks} more={moreLinks} canCreate={canCreate} />
      {/* Owners from before Today arrived: Life and work, or Just work, asked once. */}
      {askMode && !viewing && !preview && !readOnly && <NewHome />}
      {canCreate && (
        <CreateMenu
          kind={workspace.kind}
          Job={terms.Job}
          Client={terms.Client}
          clientNames={Object.fromEntries(businesses.map((b) => [b.id, b.name]))}
          brain={Boolean(process.env.ANTHROPIC_API_KEY)}
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
