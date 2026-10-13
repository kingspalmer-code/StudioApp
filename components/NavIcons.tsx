// Line icons for the sections, shared by the phone tab bar and the sidebar rail.
export const NAV_ICONS: Record<string, React.ReactNode> = {
  "/queue": <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  "/overview": <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  "/gallery": <path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM4 16l4.5-4.5L13 16M13 14l2.5-2.5L20 16M15.5 8.5h.01" />,
  "/portal": <path d="M12 5v14M5 12h14" />,
  "/customers": <path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7" />,
  "/team": <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />,
  "/personal": <path d="M9 11l2.5 2.5L16 9M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
};
NAV_ICONS["/people"] = NAV_ICONS["/customers"];
NAV_ICONS["/tasks"] = NAV_ICONS["/team"];

export function NavIcon({ href, strokeWidth = 1.9 }: { href: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NAV_ICONS[href]}
    </svg>
  );
}
