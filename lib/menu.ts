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
