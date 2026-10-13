import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oatcake",
  description: "Organised by design.",
  appleWebApp: { capable: true, title: "Oatcake", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  return (
    <html lang="en-GB" suppressHydrationWarning data-theme={theme === "light" || theme === "dark" ? theme : undefined}>
      <body>
        {/* Only shown in the Mac app: the strip behind the window buttons, which also moves the window. */}
        <div className="app-drag" data-tauri-drag-region aria-hidden />
        {children}
      </body>
    </html>
  );
}
