// Line icons for the sections, shared by the phone tab bar and the sidebar rail.
export const NAV_ICONS: Record<string, React.ReactNode> = {
  "/queue": <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  "/overview": <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  "/gallery": <path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM4 16l4.5-4.5L13 16M13 14l2.5-2.5L20 16M15.5 8.5h.01" />,
  // A card-file drawer.
  "/filing": <path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9ZM6 9V6.5L9 4h6l3 2.5V9M10 14h4" />,
  "/apps": <path d="M5 4h5v5H5zM14 4h5v5h-5zM5 15h5v5H5zM14 15h5v5h-5z" />,
  "/portal": <path d="M12 5v14M5 12h14" />,
  "/customers": <path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7" />,
  "/team": <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />,
  // A client's own requests: an in-tray.
  requests: <path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20M4 13l2.2-7.2A1.2 1.2 0 0 1 7.35 5h9.3a1.2 1.2 0 0 1 1.15.8L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Z" />,
  "/settings": <path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4" />,
  "/calendar": <path d="M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM4 10h16M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />,
  // A ring closing, like a habit kept.
  "/habits": <path d="M20 12a8 8 0 1 1-4-6.93M9 11.5l2.5 2.5L20 5.5" />,
  "/personal": <path d="M9 11l2.5 2.5L16 9M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  // Pages that can be pinned from further in (Edit sidebar > Add a page).
  "/admin": <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3ZM9 12l2 2 4-4" />,
  "/admin/support": <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8 9h8M8 12h5" />,
  "/admin/workspaces": <path d="M4 20V8l8-4 8 4v12M4 20h16M9 20v-5h6v5M8 10h.01M12 10h.01M16 10h.01" />,
  "/account": <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0" />,
  "/notifications": <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />,
  "/help": <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" />,
  "/apps/3d-viewer": <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9" />,
  "/apps/job-time": <path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 13V9M12 13l3 2M10 2h4M12 2v3" />,
};
NAV_ICONS["/people"] = NAV_ICONS["/customers"];
NAV_ICONS["/admin/people"] = NAV_ICONS["/customers"];
NAV_ICONS["/tasks"] = NAV_ICONS["/team"];

export function NavIcon({ href, strokeWidth = 1.9 }: { href: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NAV_ICONS[href]}
    </svg>
  );
}
