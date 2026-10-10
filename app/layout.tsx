import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oatcake",
  description: "Design requests for The Brewery Tap, HopRocket, Boomtowers, Motherchip and Queens Brewery.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  return (
    <html lang="en-GB" data-theme={theme === "light" || theme === "dark" ? theme : undefined}>
      <body>{children}</body>
    </html>
  );
}
