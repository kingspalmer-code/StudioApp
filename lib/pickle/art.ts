import type { Wear } from "./catalogue";

// Pickle's pixel art, shared by the widget (components/QueueWidgets.tsx) and Pickle's World
// (app/pickle). An outlined round blob on a 22 × 18 grid, shaded along its lower right like the
// old LCD ones, with a face per mood, optional feet, a hat and whatever he's wearing.
export const W = 22, H = 18, PX = 4;
export const INK = "#1d201a", SHADE = "rgba(29,32,26,.32)";

const px = (x: number, y: number) => `M${x * PX} ${y * PX}h${PX}v${PX}h-${PX}z`;
const inside = (x: number, y: number) => ((x - 10.5) / 10) ** 2 + ((y - 9.2) / 8.4) ** 2 <= 1;
const rim = (x: number, y: number) => !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
const shaded = (x: number, y: number) => !inside(x + 2, y + 1) || !inside(x + 1, y + 2);

export const BODY = (() => {
  let ink = "", shade = "";
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      if (rim(x, y)) ink += px(x, y);
      else if (shaded(x, y)) shade += px(x, y);
    }
  return { ink, shade };
})();

export type Mood = "idle" | "happy" | "sad" | "eat" | "sleep" | "cool";
export const FACES: Record<Mood, string[]> = {
  idle: [".#.......#.", "#.#.....#.#", "#.#.....#.#", ".#..###..#."],
  happy: ["...........", ".#.......#.", "#.#.....#.#", "....###...."],
  sad: ["...........", "###.....###", "...........", "...#####..."],
  eat: ["...........", "##.......##", "....###....", "....###...."],
  sleep: ["...........", "...........", "###.....###", "....###...."],
  cool: ["###########", "####...####", ".##.....##.", "....###...."],
};

// Pixel rows (# is filled) as a path, offset by dx, dy grid squares.
export function sprite(rows: string[], dx: number, dy: number) {
  let d = "";
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === "#") d += px(x + dx, y + dy); }));
  return d;
}
export const face = (rows: string[]) => sprite(rows, 5, 7);
export const FEET = ["..###.......###...", ".####......####..."];

// Pixel art in a few colours: # is ink, letters are colours from a palette (a main, b its shade,
// c an accent, w a glint), . is see-through. Without a palette, letters draw in the LCD's shade.
export type Pal = Partial<Record<"a" | "b" | "c" | "w", string>>;
function paintRows(rows: string[], dx: number, dy: number, pal?: Pal): Layer[] {
  const by: Record<string, string> = {};
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") by[ch] = (by[ch] ?? "") + px(x + dx, y + dy); }));
  return Object.entries(by).map(([ch, d]): Layer => {
    if (ch === "#") return { d, tone: "ink" };
    const fill = pal?.[ch as keyof Pal];
    return fill ? { d, fill } : ch === "w" ? { d, fill: "#fff", opacity: 0.5 } : { d, tone: "shade" };
  });
}
// A darker version of a colour, for the shaded side of clothes.
export function darker(hex: string, by = 0.72) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * by).toString(16).padStart(2, "0");
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

// Hats sit on his head; sink is how many of their rows overlap the top of it. pal colours a shop
// hat (a from the item's colour, b worked out from it).
export type Hat = { rows: string[]; dx: number; sink?: number; pal?: Pal };
export const HATS: Record<string, Hat> = {
  crown: { rows: ["#..#..#", "##.#.##", "#######", "#######"], dx: 7 },
  party: { rows: ["..#..", ".###.", ".#.#.", "##.##", "#####"], dx: 8, sink: 1 },
  bow: { rows: ["##...##", "###.###", "#######", "###.###", "##...##"], dx: 13, sink: 3 },
  wizard: { rows: ["....#....", "...###...", "..#.#.#..", "..#...#..", ".#..#..#.", "#########"], dx: 6, sink: 1 },
  // A knitted beanie pulled down to his eyebrows: bobble, a rounded crown, and a ribbed turn-up.
  beanie: {
    rows: [
      ".......####.......",
      "......#cccc#......",
      ".......####.......",
      ".....########.....",
      "...##aaaaaaaa##...",
      "..#aawaaaaaaaab#..",
      ".#aawaaaaaaaaabb#.",
      "#aaaaaaaaaaaaaabb#",
      "##################",
      "#b#b#b#b#b#b#b#b##",
      "##################",
    ],
    dx: 2, sink: 6,
  },
  tophat: {
    rows: ["..########..", "..#aaaaaw#..", "..#aaaaaa#..", "..#aaaaaa#..", "..########..", "..#cccccc#..", "############"],
    dx: 5, sink: 3,
  },
  // A baseball cap, peak to the right, sitting down on his forehead.
  cap: {
    rows: [
      "......#########.......",
      "....##aaaaaaaaa##.....",
      "...#aaaawaaaaaaab#....",
      "..#aaaaaaaaaaaaabb#...",
      ".##################bb#",
      "..................####",
    ],
    dx: 0, sink: 6,
  },
  // Headphones: a band hugging the top of his head and a cup over each side.
  phones: {
    rows: [
      ".......########.......",
      ".....##........##.....",
      "....#............#....",
      "...#..............#...",
      "..#................#..",
      "####..............####",
      "#aa#..............#aa#",
      "#aw#..............#wa#",
      "#ab#..............#ba#",
      "####..............####",
    ],
    dx: 0, sink: 9,
  },
};

// Clothes drawn over his body, on the same grid. Rows start at y (from the top of his head).
const SCARF = {
  y: 12,
  rows: [
    ".####################.",
    "#aaccaaccaaccaaccaacc#",
    "#aaccaaccaaccaaccaacc#",
    ".##############aaa###.",
    "..............#ccc#...",
    "..............#a#a#...",
  ],
};
// A t-shirt: short sleeves poking out at the sides, a round neck, a little oatcake on the chest
// and a darker hem. The body under it is filled from TEE.y down, except the neck hole.
const TEE = {
  y: 11,
  neck: [7, 14], // the neck hole on the top row
  rows: [
    "#######........#######",
    "#a#b....######....b#a#",
    "#aa#..............#aa#",
    "####.....cc.......####",
    "........cwwc..........",
    ".........cc...........",
  ],
};
// Sunglasses from the shop: two dark lenses with a glint, and a grin.
const SHADES = ["###########", "#w###.#w###", ".###...###.", "....###...."];

// The layers that make up Pickle, back to front. A layer without a fill uses the LCD's ink or
// shade (class names), so it follows the screen; clothes and paint bring their own colours.
export type Layer = { d: string; tone?: "ink" | "shade"; fill?: string; opacity?: number };
export function pickleLayers({ mood, feet, hat, wear = {}, paint = null }: { mood: Mood; feet: boolean; hat: Hat | null; wear?: Wear; paint?: string | null }) {
  const top = hat ? hat.rows.length - (hat.sink ?? 0) : 0;
  let fill = "", shade = "", tee = "", teeShade = "";
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inside(x, y) || rim(x, y)) continue;
      const dark = shaded(x, y);
      if (wear.shirt && y >= TEE.y && !(y === TEE.y && x >= TEE.neck[0] && x <= TEE.neck[1])) (dark || y >= H - 2 ? (teeShade += px(x, y)) : (tee += px(x, y)));
      else if (dark) shade += px(x, y);
      else fill += px(x, y);
    }
  const layers: Layer[] = [];
  if (paint) layers.push({ d: fill + shade, fill: paint });
  layers.push({ d: shade, tone: "shade", ...(paint ? { fill: darker(paint), opacity: 0.6 } : {}) });
  if (wear.shirt) layers.push({ d: tee, fill: wear.shirt }, { d: teeShade, fill: darker(wear.shirt, 0.82) });
  const shades = wear.shades && mood !== "sleep" && mood !== "eat";
  layers.push({ d: BODY.ink + (shades ? "" : face(FACES[mood])) + (feet ? sprite(FEET, 2, H - 1) : "") });
  if (shades) layers.push(...paintRows(SHADES, 5, 7));
  // Sleeves and neckline go over his outline, so they stick out past his sides.
  if (wear.shirt) layers.push(...paintRows(TEE.rows, 0, TEE.y, { a: wear.shirt, b: darker(wear.shirt, 0.82), c: darker(wear.shirt, 0.55), w: "#f4efe0" }));
  if (wear.scarf) layers.push(...paintRows(SCARF.rows, 0, SCARF.y, { a: wear.scarf, c: "#f4efe0" }));
  if (hat) layers.push(...paintRows(hat.rows, hat.dx, -top, hat.pal));
  return { layers, viewBox: `0 ${-top * PX} ${W * PX} ${(H + top + (feet ? 2 : 0)) * PX}` };
}

// The hat to draw: a worn one from the shop wins over the one he's earned by levelling up.
export function hatOf(wear: Wear | undefined, earned: Hat | null): Hat | null {
  const h = wear?.hat ? HATS[wear.hat] : undefined;
  if (h) return wear!.hatColour ? { ...h, pal: { a: wear!.hatColour, b: darker(wear!.hatColour), c: "#f4efe0", w: "#ffffff" } } : { ...h, pal: { a: "#33363d", b: "#22252b", c: "#c0392b", w: "#6b6f78" } };
  return earned;
}

// Pickle as a standalone SVG string, for drawing onto a canvas (the arcade games).
export function pickleSvg(opts: Parameters<typeof pickleLayers>[0]) {
  const { layers, viewBox } = pickleLayers(opts);
  const paths = layers.map((l) => `<path fill="${l.fill ?? (l.tone === "shade" ? SHADE : INK)}"${l.opacity ? ` opacity="${l.opacity}"` : ""} d="${l.d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" shape-rendering="crispEdges">${paths}</svg>`;
}
