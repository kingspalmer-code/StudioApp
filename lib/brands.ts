import type { Business } from "./types";

// Each business's identity. Drop logo files in public/brands/ and point `logo` at them;
// until then a monogram badge in the brand colour stands in.
const BRANDS: Record<string, { color?: string; logo?: string; monogram?: string }> = {
  "brewery-tap": { monogram: "BT" },
  hoprocket: { monogram: "HR" },
  boomtowers: { monogram: "BO" },
  motherchip: { monogram: "MC" },
  "queens-brewery": { monogram: "QB" },
};

export type Brand = { name: string; color: string; ink: string; logo?: string; monogram: string };

// Black or white, whichever reads better on the brand colour.
function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#1c1c1e" : "#ffffff";
}

export function brandFor(biz: Business): Brand {
  const b = BRANDS[biz.slug] ?? {};
  const color = b.color ?? biz.color;
  const monogram =
    b.monogram ??
    biz.name
      .replace(/^the\s+/i, "")
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  return { name: biz.name, color, ink: inkFor(color), logo: b.logo, monogram };
}
