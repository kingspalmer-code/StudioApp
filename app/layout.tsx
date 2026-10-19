import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import ClearZero from "@/components/ClearZero";
import NavProgress from "@/components/NavProgress";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oatcake",
  description: "Organised by design.",
  appleWebApp: { capable: true, title: "Oatcake", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = jar.get("theme")?.value;
  // How wide you last dragged the sidebar (components/RailGrip.tsx), so it starts that way.
  const rail = Math.min(320, Math.max(68, Number(jar.get("rail_w")?.value) || 68));
  return (
    <html
      lang="en-GB"
      suppressHydrationWarning
      data-theme={theme === "light" || theme === "dark" ? theme : undefined}
      data-rail={rail > 68 ? "open" : undefined}
      style={rail > 68 ? ({ "--rail-w": `${rail}px` } as React.CSSProperties) : undefined}
    >
      <head>
        {/* A job opened beside the queue (components/SplitPanel.tsx) is this site in a frame: drop the sidebar and bars there. */}
        <script dangerouslySetInnerHTML={{ __html: "if(window.top!==window.self)document.documentElement.classList.add('embedded')" }} />
      </head>
      <body>
        {/* Only shown in the Mac app: the strip behind the window buttons, which also moves the window. */}
        <div className="app-drag" data-tauri-drag-region aria-hidden />
        <NavProgress />
        <ClearZero />
        {children}
      </body>
    </html>
  );
}
