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

// Hats sit on his head; sink is how many of their rows overlap the top of it.
export type Hat = { rows: string[]; dx: number; sink?: number; colour?: string };
export const HATS: Record<string, Hat> = {
  crown: { rows: ["#..#..#", "##.#.##", "#######", "#######"], dx: 7 },
  party: { rows: ["..#..", ".###.", ".#.#.", "##.##", "#####"], dx: 8, sink: 1 },
  bow: { rows: ["##...##", "###.###", "#######", "###.###", "##...##"], dx: 13, sink: 3 },
  wizard: { rows: ["....#....", "...###...", "..#.#.#..", "..#...#..", ".#..#..#.", "#########"], dx: 6, sink: 1 },
  beanie: { rows: [".....#.....", "....###....", "..#######..", ".#########.", "#.#.#.#.#.#"], dx: 5, sink: 2 },
  tophat: { rows: [".#######.", ".#######.", ".#.....#.", ".#######.", "#########"], dx: 6, sink: 1 },
  cap: { rows: ["..#######...", ".#########..", "#############"], dx: 3, sink: 1 },
  phones: { rows: ["....#######....", "..##.......##..", ".#...........#.", "##...........##", "##...........##"], dx: 3, sink: 4 },
};

// The layers that make up Pickle, back to front. A layer without a fill uses the LCD's ink or
// shade (class names), so it follows the screen; clothes and paint bring their own colours.
export type Layer = { d: string; tone?: "ink" | "shade"; fill?: string; opacity?: number };
export function pickleLayers({ mood, feet, hat, wear = {}, paint = null }: { mood: Mood; feet: boolean; hat: Hat | null; wear?: Wear; paint?: string | null }) {
  const top = hat ? hat.rows.length - (hat.sink ?? 0) : 0;
  let fill = "", shade = "", tee = "", hem = "", scarf = "";
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inside(x, y) || rim(x, y)) continue;
      if (wear.shirt && y >= 12) (y === 12 ? (hem += px(x, y)) : (tee += px(x, y)));
      else if (wear.scarf && y === 11) scarf += px(x, y);
      else if (shaded(x, y)) shade += px(x, y);
      else fill += px(x, y);
    }
  const layers: Layer[] = [];
  if (paint) layers.push({ d: fill + shade, fill: paint });
  layers.push({ d: shade, tone: "shade" });
  if (wear.shirt) layers.push({ d: tee + hem, fill: wear.shirt }, { d: hem, tone: "ink", opacity: 0.5 });
  if (wear.scarf) layers.push({ d: scarf, fill: wear.scarf });
  layers.push({ d: BODY.ink + face(FACES[wear.shades && mood !== "sleep" && mood !== "eat" ? "cool" : mood]) + (feet ? sprite(FEET, 2, H - 1) : "") });
  if (hat) layers.push(hat.colour ? { d: sprite(hat.rows, hat.dx, -top), fill: hat.colour } : { d: sprite(hat.rows, hat.dx, -top), tone: "ink" });
  return { layers, viewBox: `0 ${-top * PX} ${W * PX} ${(H + top + (feet ? 2 : 0)) * PX}` };
}

// The hat to draw: a worn one from the shop wins over the one he's earned by levelling up.
export function hatOf(wear: Wear | undefined, earned: Hat | null): Hat | null {
  if (wear?.hat && HATS[wear.hat]) return { ...HATS[wear.hat], colour: wear.hatColour };
  return earned;
}

// Pickle as a standalone SVG string, for drawing onto a canvas (the arcade games).
export function pickleSvg(opts: Parameters<typeof pickleLayers>[0]) {
  const { layers, viewBox } = pickleLayers(opts);
  const paths = layers.map((l) => `<path fill="${l.fill ?? (l.tone === "shade" ? SHADE : INK)}"${l.opacity ? ` opacity="${l.opacity}"` : ""} d="${l.d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" shape-rendering="crispEdges">${paths}</svg>`;
}
