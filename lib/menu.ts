// Menu buttons that can't be switched off on computers (Settings > Menu): the first one, and
// Settings itself, so the switches are never out of reach.
export const alwaysOnComputer = (href: string, i: number) => i === 0 || href === "/settings";

// The sidebar's buttons in the order the owner dragged them into (Edit sidebar). Buttons the saved
// order doesn't know about, such as ones added since, keep their place at the end.
export function ordered<T extends { href: string }>(links: T[], order: string[] = []): T[] {
  const at = (href: string) => {
    const i = order.indexOf(href);
    return i === -1 ? order.length : i;
  };
  return links.map((l, i) => ({ l, i })).sort((a, b) => at(a.l.href) - at(b.l.href) || a.i - b.i).map((x) => x.l);
}

// The phone tab bar holds the first few buttons; the rest wait under More, so a new account opens
// with a calm bar instead of every section squeezed along the bottom. Settings > Menu picks which
// go on the bar (saved as phone_tabs); the first button always stays.
export const PHONE_TABS = 4;
export const onPhoneTab = (href: string, i: number, shown?: string[]) => i === 0 || (shown ? shown.includes(href) : i < PHONE_TABS);

// What a new owner's sidebar leaves out until they switch it on (Settings > Menu or Edit sidebar):
// New job, since the + button at the top does the same, and Gallery, since Filing holds finished
// work too. Anyone who has already chosen their own buttons keeps their choice.
export const OWNER_HIDDEN_BY_DEFAULT = ["/portal", "/gallery"];

// The pages that sit under Work (the business side: jobs, clients, finished work, the team), so its
// button stays lit on any of them.
export const WORK_PREFIXES = ["/queue", "/overview", "/people", "/customers", "/gallery", "/filing", "/team", "/tickets", "/documents", "/portal"];

// Which button is lit for a path: the longest of their own addresses the path starts with, and
// failing that a button whose `match` covers it (Work on a client's page, say).
export function activeHref(links: { href: string; match?: string[] }[], path: string): string | undefined {
  const own = links.map((l) => l.href).filter((h) => path === h || path.startsWith(h + "/") || path.startsWith(h + "?")).sort((a, b) => b.length - a.length)[0];
  if (own) return own;
  return links.find((l) => l.match?.some((m) => path === m || path.startsWith(m + "/")))?.href;
}

// How an owner's Oatcake opens (Settings > Menu). "life" is the Today home that arrived on
// 26 Oct 2026: Today first, the business side behind one Work button. "work" is the way it was
// before, for people who use it purely for client work: Jobs first, every work page in the menu,
// no Work strip. Today and Habits can still be added to the sidebar. Saved per account
// (user_metadata.home_mode); employees, clients and managers aren't affected.
export type HomeMode = "life" | "work";
export const homeMode = (v: unknown): HomeMode => (v === "work" ? "work" : "life");

// When Today became the home page. Workspaces set up before then get asked once which way they'd
// like it (components/NewHome.tsx); anyone who signed up since started on Today and isn't asked.
export const TODAY_ARRIVED = "2026-10-26T20:34:44Z";
