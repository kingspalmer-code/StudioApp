import type { MetadataRoute } from "next";

// Lets Oatcake be added to a phone's Home Screen as an app, which iPhones need before they'll show alerts.
// Some pages can be added as their own icon that opens straight onto them (pages set this as their
// manifest in their metadata, and the root layout uses "oatcake").
const APPS: Record<string, { name: string; start: string }> = {
  oatcake: { name: "Oatcake", start: "/" },
  todo: { name: "To-do", start: "/calendar" },
  habits: { name: "Habits", start: "/habits" },
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
    theme_color: "#382a25",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return Response.json(manifest, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
