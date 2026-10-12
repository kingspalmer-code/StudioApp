import type { MetadataRoute } from "next";

// Lets Oatcake be added to a phone's Home Screen as an app, which iPhones need before they'll show alerts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oatcake",
    short_name: "Oatcake",
    description: "Organised by design.",
    start_url: "/",
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
}
