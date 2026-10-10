import type { Business } from "./types";

type Theme = { accent: string; ink?: string };

// Each business's identity: its logo (in public/brands/), the tile colour the logo sits on,
// and the accent its own portal uses for buttons and highlights in light and dark mode.
const BRANDS: Record<string, { logo?: string; tile?: string; light: Theme; dark?: Theme; monogram?: string }> = {
  "brewery-tap": { logo: "/brands/brewery-tap.svg", tile: "#842f1b", light: { accent: "#c95228" } },
  hoprocket: {
    logo: "/brands/hoprocket.svg",
    tile: "#ffffff",
    light: { accent: "#021801", ink: "#f9c238" },
    dark: { accent: "#f9c238", ink: "#021801" },
  },
  boomtowers: { logo: "/brands/boomtowers.svg", tile: "#ffffff", light: { accent: "#dd5136" } },
  motherchip: { logo: "/brands/motherchip.svg", tile: "#ffffff", light: { accent: "#009245" } },
  "queens-brewery": {
    logo: "/brands/queens-brewery.svg",
    tile: "#ffffff",
    light: { accent: "#231f20" },
    dark: { accent: "#f2f2f7" },
  },
};

export type Brand = {
  name: string;
  color: string;
  ink: string;
  dark: { color: string; ink: string };
  tile: string;
  logo?: string;
  monogram: string;
};

// Black or white, whichever reads better on the given colour.
function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#1c1c1e" : "#ffffff";
}

export function brandFor(biz: Business): Brand {
  const b = BRANDS[biz.slug];
  const light = b?.light ?? { accent: biz.color };
  const dark = b?.dark ?? light;
  const monogram =
    b?.monogram ??
    biz.name
      .replace(/^the\s+/i, "")
      .split(/\s+/)
      .filter((w) => /^[a-z0-9]/i.test(w))
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  return {
    name: biz.name,
    color: light.accent,
    ink: light.ink ?? inkFor(light.accent),
    dark: { color: dark.accent, ink: dark.ink ?? inkFor(dark.accent) },
    tile: b?.tile ?? light.accent,
    logo: b?.logo,
    monogram,
  };
}

// CSS that re-points the accent tokens at a business's colours, in both themes.
export function brandThemeCss(selector: string, brand: Brand): string {
  const dark = `--accent:${brand.dark.color};--accent-ink:${brand.dark.ink}`;
  return (
    `${selector}{--accent:${brand.color};--accent-ink:${brand.ink}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) ${selector}{${dark}}}` +
    `:root[data-theme="dark"] ${selector}{${dark}}`
  );
}
