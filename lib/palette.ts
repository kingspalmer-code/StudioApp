// Colour themes from a palette (components/Colours.tsx): a few colours, from an image someone drops
// in, hex codes or a Coolors link, or one of the presets below, turned into every colour token the
// app uses, in light and dark mode. The palette's own colours are kept for the accent and a soft wash
// behind the page; the surfaces text sits on are near-neutral tints of it, and every pairing is
// checked for contrast, so whatever goes in, text stays readable. Saved to the account
// (user_metadata palette). The status colours (red, green, blue...) keep their meaning and don't change.

type Lch = { L: number; C: number; h: number };
type Rgb = [number, number, number];

export const PRESETS: { name: string; colours: string[] }[] = [
  { name: "Seaside", colours: ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"] },
  { name: "Matcha", colours: ["#606c38", "#283618", "#fefae0", "#dda15e", "#bc6c25"] },
  { name: "Riso", colours: ["#ff48b0", "#0078bf", "#ffe800", "#f7f3ea"] },
  { name: "Plum", colours: ["#3d1f3d", "#8e3b74", "#e0a6c4", "#f5e1ea"] },
  { name: "Lido", colours: ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#073b4c"] },
  { name: "Ink", colours: ["#0d1b2a", "#1b263b", "#415a77", "#778da9", "#e0e1dd"] },
  { name: "Tomato", colours: ["#d62828", "#f77f00", "#fcbf49", "#eae2b7", "#003049"] },
  { name: "Lavender", colours: ["#7b6ef6", "#b8b1ff", "#e7e3ff", "#2d2a4a"] },
  { name: "Forest", colours: ["#1b4332", "#2d6a4f", "#52b788", "#b7e4c7", "#d8f3dc"] },
  { name: "Sorbet", colours: ["#ff99c8", "#fcf6bd", "#d0f4de", "#a9def9", "#e4c1f9"] },
  { name: "Mono", colours: ["#111111", "#555555", "#bbbbbb", "#f2f2f2"] },
  { name: "Arcade", colours: ["#7400b8", "#5e60ce", "#48bfe3", "#72efdd", "#ff006e"] },
];

// ── Colour maths: sRGB ⇄ OKLCH, which keeps lightness even across hues ──
const toLin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("");
}

function rgbToLch([r, g, b]: Rgb): Lch {
  const [lr, lg, lb] = [toLin(r), toLin(g), toLin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI };
}

function lchToLinear({ L, C, h }: Lch): Rgb {
  const A = C * Math.cos((h * Math.PI) / 180), B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

// The nearest colour a screen can show: same lightness and hue, with chroma eased off until it fits.
function lchToRgb(c: Lch): Rgb {
  const fits = (x: Rgb) => x.every((v) => v >= -0.0005 && v <= 1.0005);
  let lin = lchToLinear(c);
  if (!fits(lin)) {
    let lo = 0, hi = c.C;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (fits(lchToLinear({ ...c, C: mid }))) lo = mid;
      else hi = mid;
    }
    lin = lchToLinear({ ...c, C: lo });
  }
  return lin.map((v) => fromLin(Math.min(1, Math.max(0, v)))) as Rgb;
}

const lch = (hex: string) => rgbToLch(hexToRgb(hex) ?? [0, 0, 0]);
const hex = (c: Lch) => rgbToHex(lchToRgb(c));
const rgba = (c: Lch, a: number) => `rgba(${lchToRgb(c).map(Math.round).join(",")},${a})`;

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: Lch, b: Lch): number {
  const [x, y] = [luminance(lchToRgb(a)), luminance(lchToRgb(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Distance between two colours as people see it, for telling apart colours picked from an image.
export function distance(a: Rgb, b: Rgb): number {
  const [p, q] = [rgbToLch(a), rgbToLch(b)];
  const [pa, pb] = [p.C * Math.cos((p.h * Math.PI) / 180), p.C * Math.sin((p.h * Math.PI) / 180)];
  const [qa, qb] = [q.C * Math.cos((q.h * Math.PI) / 180), q.C * Math.sin((q.h * Math.PI) / 180)];
  return Math.hypot(p.L - q.L, pa - qa, pb - qb);
}
export const chroma = (rgb: Rgb) => rgbToLch(rgb).C;

// ── Reading palettes ──

// Hex codes from anything pasted: "#264653, #2a9d8f", a Coolors link (coolors.co/palette/264653-2a9d8f-…),
// or a list copied from a design app.
export function parseColours(text: string): string[] {
  const found = text.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|(?<![0-9a-z])[0-9a-f]{6}(?![0-9a-z])/gi) ?? [];
  return [...new Set(found.map((h) => rgbToHex(hexToRgb(h)!)))].slice(0, 8);
}

// A saved palette, if it's a sensible one (what's in user_metadata could be anything).
export function cleanPalette(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const list = v.filter((x): x is string => typeof x === "string" && hexToRgb(x) !== null).map((x) => rgbToHex(hexToRgb(x)!));
  return list.length ? list.slice(0, 8) : null;
}

// Something new each time: a random hue and a way of picking companions for it.
export function randomPalette(): string[] {
  const h = Math.random() * 360;
  const ways = [[0, 30, 60, 200], [0, 180, 20, 160], [0, 120, 240, 60], [0, 150, 210, 30], [0, 15, -15, 180]];
  const way = ways[Math.floor(Math.random() * ways.length)];
  const Ls = [0.45, 0.7, 0.85, 0.3, 0.6];
  return way.map((d, i) => hex({ L: Ls[i] + (Math.random() - 0.5) * 0.1, C: 0.08 + Math.random() * 0.12, h: h + d }));
}

// ── Palette → theme ──

type Tokens = Record<string, string>;

// Moves a colour's lightness one way until it reads against the background, keeping its hue.
function readable(c: Lch, on: Lch, min: number, step: number): Lch {
  let x = { ...c };
  for (let i = 0; i < 60 && contrast(x, on) < min && x.L > 0.02 && x.L < 0.99; i++) x = { ...x, L: x.L + step };
  return x;
}

function tokens(colours: Lch[], mode: "light" | "dark"): Tokens {
  const dark = mode === "dark";
  // The accent is the palette's liveliest colour; a palette of greys uses its darkest (lightest in dark mode).
  const vivid = [...colours].sort((a, b) => b.C * (1 - Math.abs(b.L - 0.6) * 0.6) - a.C * (1 - Math.abs(a.L - 0.6) * 0.6));
  const mono = vivid[0].C < 0.04;
  const byL = [...colours].sort((a, b) => a.L - b.L);
  const pick = mono ? (dark ? byL[byL.length - 1] : byL[0]) : vivid[0];
  // The surfaces are tinted with the palette's first colour (the main one in a dropped image).
  const base = colours[0].C >= 0.012 ? colours[0] : pick;
  const h = base.h;
  const c = Math.min(base.C, 0.16);
  const bg = dark ? { L: 0.19, C: Math.min(c * 0.35, 0.03), h } : { L: 0.955, C: Math.min(c * 0.3, 0.028), h };
  const surface = dark ? { L: 0.235, C: Math.min(c * 0.3, 0.026), h } : { L: 0.99, C: Math.min(c * 0.1, 0.01), h };
  const surface2 = dark ? { L: 0.275, C: Math.min(c * 0.3, 0.028), h } : { L: 0.972, C: Math.min(c * 0.22, 0.02), h };
  const label = dark ? { L: 0.94, C: Math.min(c * 0.15, 0.02), h } : { L: 0.25, C: Math.min(c * 0.2, 0.025), h };
  // Translucent greys are the label colour faded, like the built-in theme does.
  const ink = dark ? label : { L: 0.3, C: Math.min(c * 0.25, 0.03), h };

  // Links and selected things are accent-coloured text, so it has to read on every surface (4.5:1).
  const start = { ...pick, C: Math.min(pick.C, 0.2), L: dark ? Math.max(pick.L, 0.7) : Math.min(Math.max(pick.L, 0.45), 0.62) };
  const darkest = dark ? surface2 : bg;
  const accent = readable(start, darkest, 4.5, dark ? 0.015 : -0.015);
  // Button text on the accent: whichever of the page's light or dark reads better.
  const light = dark ? label : surface;
  const deep = dark ? { L: 0.2, C: Math.min(accent.C * 0.3, 0.03), h: accent.h } : label;
  const accentInk = contrast(accent, light) >= contrast(accent, deep) ? light : deep;

  // The oatcake fill (Pickle, the biscuit) and the wash take the palette's other colours.
  const others = colours.filter((x) => x !== pick);
  const second = others.find((x) => x.C > 0.03) ?? others[0] ?? pick;
  const oat = dark ? { L: 0.33, C: Math.min(second.C, 0.06), h: second.h } : { L: 0.87, C: Math.min(second.C, 0.07), h: second.h };
  const spots = ["12% 8%", "92% 14%", "85% 92%", "6% 88%"];
  const washFrom = [...others, pick].slice(0, 4);
  const wash = washFrom
    .map((x, i) => {
      const w = dark ? { L: 0.38, C: Math.min(x.C, 0.12), h: x.h } : { L: 0.86, C: Math.min(x.C, 0.1), h: x.h };
      return `radial-gradient(ellipse 55% 45% at ${spots[i]}, ${rgba(w, dark ? 0.32 : 0.55)}, transparent 70%)`;
    })
    .join(", ");

  return {
    "--bg": hex(bg),
    "--surface": hex(surface),
    "--surface-2": hex(surface2),
    "--fill": rgba(ink, dark ? 0.1 : 0.08),
    "--label": hex(label),
    "--label-2": rgba(ink, 0.64),
    "--label-3": rgba(ink, dark ? 0.32 : 0.34),
    "--sep": rgba(ink, 0.14),
    "--accent": hex(accent),
    "--accent-ink": hex(accentInk),
    "--bar": rgba(bg, 0.82),
    "--shadow": dark ? "0 1px 2px rgba(0,0,0,.4), 0 8px 28px rgba(0,0,0,.5)" : `0 1px 2px ${rgba(ink, 0.06)}, 0 8px 28px ${rgba(ink, 0.1)}`,
    "--oat-fill": hex(oat),
    "--wash": wash,
    // Liquid glass (the floating chrome) frosted in the new surfaces.
    "--glass": rgba(dark ? surface2 : surface, dark ? 0.56 : 0.62),
    "--glass-thick": rgba(dark ? surface : surface2, dark ? 0.76 : 0.8),
    "--glass-line": rgba(ink, 0.1),
    "--glass-press": rgba(ink, dark ? 0.1 : 0.07),
    ...(dark
      ? {}
      : {
          "--glass-shadow": `0 1px 2px ${rgba(ink, 0.06)}, 0 10px 34px ${rgba(ink, 0.14)}`,
          "--glass-edge": `inset 0 1px 0 rgba(255,255,255,.75), inset 0 0 0 .5px rgba(255,255,255,.45), inset 0 -1px 1px ${rgba(ink, 0.05)}`,
        }),
  };
}

export function themeFor(palette: string[]): { light: Tokens; dark: Tokens } {
  const colours = palette.map(lch);
  return { light: tokens(colours, "light"), dark: tokens(colours, "dark") };
}

// The CSS that re-colours the whole app. It also beats a client's business colours (lib/brands.ts),
// since a palette someone picked for themselves should win, and it comes after them in the page.
export function paletteCss(palette: string[] | null): string {
  if (!palette?.length) return "";
  const { light, dark } = themeFor(palette);
  const body = (t: Tokens) => Object.entries(t).map(([k, v]) => `${k}:${v}`).join(";");
  const sel = (pre: string) => `${pre},${pre} .brand-theme`;
  return (
    `${sel(":root")}{${body(light)}}` +
    `@media (prefers-color-scheme: dark){${sel(':root:not([data-theme="light"])')}{${body(dark)}}}` +
    `${sel(':root[data-theme="dark"]')}{${body(dark)}}`
  );
}

// Boxes on the page either float above it (raised, Oatcake's look) or sit pressed into it
// (embossed): the page's own colour with a soft inner shadow. Only boxes in the page itself
// change; menus and sheets keep floating.
export type BoxStyle = "raised" | "embossed";

export const cleanBoxes = (v: unknown): BoxStyle => (v === "embossed" ? "embossed" : "raised");

export function boxesCss(boxes: BoxStyle): string {
  if (boxes !== "embossed") return "";
  const light = "--surface:var(--bg);--shadow:inset 0 1.5px 3px rgba(56,42,37,.13),inset 0 -1px 0 rgba(255,255,255,.65),0 0 0 .5px rgba(56,42,37,.06)";
  const dark = "--surface:var(--bg);--shadow:inset 0 2px 4px rgba(0,0,0,.45),inset 0 -1px 0 rgba(255,255,255,.05),0 0 0 .5px rgba(255,255,255,.04)";
  // Dialogs, sheets and menus that open inside the page keep the floating look.
  const lift = 'main [role="dialog"],main [role="menu"],main [role="listbox"],main .sheet{--surface:var(--up-surface);--shadow:var(--up-shadow)}';
  return (
    `:root{--up-surface:var(--surface);--up-shadow:var(--shadow)}` +
    `main{${light}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) main{${dark}}}` +
    `:root[data-theme="dark"] main{${dark}}` +
    lift
  );
}
