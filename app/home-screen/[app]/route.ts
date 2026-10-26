import type { MetadataRoute } from "next";

// Lets Oatcake be added to a phone's Home Screen as an app, which iPhones need before they'll show alerts.
// Some pages can be added as their own icon that opens straight onto them (pages set this as their
// manifest in their metadata, and the root layout uses "oatcake").
// Each has its own colour of icon (public/icons/<app>-*.png, and the page's apple-icon.png for iPhones).
const APPS: Record<string, { name: string; start: string; icons: string; theme: string }> = {
  oatcake: { name: "Oatcake", start: "/", icons: "", theme: "#382a25" },
  todo: { name: "To-do", start: "/calendar", icons: "todo-", theme: "#1f1a2b" },
  habits: { name: "Habits", start: "/habits", icons: "habits-", theme: "#1c2014" },
};

export async function GET(_req: Request, { params }: { params: Promise<{ app: string }> }) {
  const app = APPS[(await params).app];
  if (!app) return new Response("Not found", { status: 404 });
  const manifest: MetadataRoute.Manifest = {
    id: app.start,
    name: app.name,
    short_name: app.name,
    description: "Organised by design.",
    start_url: app.start,
    scope: "/",
    display: "standalone",
    background_color: "#f4efe7",
    theme_color: app.theme,
    icons: [
      { src: `/icons/${app.icons || "icon-"}192.png`, sizes: "192x192", type: "image/png" },
      { src: `/icons/${app.icons || "icon-"}512.png`, sizes: "512x512", type: "image/png" },
      { src: `/icons/${app.icons}maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return Response.json(manifest, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
