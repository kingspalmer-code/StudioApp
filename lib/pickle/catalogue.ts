// Pickle's World: everything you can earn, buy and play, in one list. The shop, the wardrobe, the
// Lab (balance check) and the server's price check all read from here, so adding a hat or a shell
// is one line. Prices are in oatcakes; check new ones in the Lab before shipping (aim: something
// small every few days, something big every few weeks).

// What each thing earns (economy 2, migration 054). The daily visit amount is set in pet_visit.
export const EARN = {
  job: 10, // a job delivered (the studio), or a business's job finished
  request: 5, // a request sent (managers and clients)
  habit: 3, // a habit done for the day
  todo: 2, // a to-do ticked off
  daily: 5, // the first visit each day
} as const;

// What the old economy (1 oatcake a thing, 2 a day) paid, for the Lab's comparison.
export const EARN_BEFORE = { job: 1, request: 1, habit: 1, todo: 1, daily: 2 } as const;

// Games pay a little and stop for the day, so playing never out-earns the real work.
export const GAMES = {
  dash: { name: "Pickle Dash", per: 100, cap: 15 }, // 1 oatcake per `per` points, `cap` a day
} as const;
export type GameId = keyof typeof GAMES;
export const GAME_CAP = 15; // across all games, a day

export type Slot = "shell" | "screen" | "paint" | "hat" | "face" | "top" | "neck";
export type Shelf = "Clothes" | "Shells" | "Screens" | "Paints";

// What an item puts on Pickle. Colours are fixed per item so he looks the same everywhere.
export type Wear = { hat?: string; hatColour?: string; shirt?: string; scarf?: string; shades?: boolean };

export type Item = {
  id: string;
  shelf: Shelf;
  slot: Slot;
  name: string;
  price: number;
  shell?: { body: string; ink: string }; // device casing
  screen?: "classic" | "amber" | "ice" | "colour"; // LCD tint
  paint?: string; // body colour, needs the colour screen
  wear?: Wear;
  needs?: string; // another item you must own first
  note?: string;
};

export const CATALOGUE: Item[] = [
  { id: "shell-oat", shelf: "Shells", slot: "shell", name: "Oat shell", price: 0, shell: { body: "#e9e4d6", ink: "#8d8670" } },
  { id: "shell-matcha", shelf: "Shells", slot: "shell", name: "Matcha shell", price: 80, shell: { body: "#9fbf8f", ink: "#5d7a52" } },
  { id: "shell-bubble", shelf: "Shells", slot: "shell", name: "Bubblegum shell", price: 80, shell: { body: "#eeb3c6", ink: "#b0647d" } },
  { id: "shell-sky", shelf: "Shells", slot: "shell", name: "Sky shell", price: 80, shell: { body: "#a8c8e6", ink: "#5b80a3" } },
  { id: "shell-midnight", shelf: "Shells", slot: "shell", name: "Midnight shell", price: 120, shell: { body: "#2d3140", ink: "#141720" } },
  { id: "shell-clear", shelf: "Shells", slot: "shell", name: "See-through purple", price: 200, shell: { body: "rgba(140,110,200,.55)", ink: "#5b4690" } },

  { id: "screen-classic", shelf: "Screens", slot: "screen", name: "Classic screen", price: 0, screen: "classic" },
  { id: "screen-amber", shelf: "Screens", slot: "screen", name: "Amber screen", price: 60, screen: "amber" },
  { id: "screen-ice", shelf: "Screens", slot: "screen", name: "Ice screen", price: 60, screen: "ice" },
  { id: "screen-colour", shelf: "Screens", slot: "screen", name: "Colour screen", price: 300, screen: "colour", note: "Lets you paint Pickle" },

  { id: "paint-pickle", shelf: "Paints", slot: "paint", name: "Pickle green", price: 40, paint: "#8fc06a", needs: "screen-colour" },
  { id: "paint-peach", shelf: "Paints", slot: "paint", name: "Peach", price: 40, paint: "#f2b48c", needs: "screen-colour" },
  { id: "paint-lilac", shelf: "Paints", slot: "paint", name: "Lilac", price: 40, paint: "#b9a3e3", needs: "screen-colour" },
  { id: "paint-golden", shelf: "Paints", slot: "paint", name: "Golden", price: 150, paint: "#e3c35a", needs: "screen-colour" },

  { id: "wear-shades", shelf: "Clothes", slot: "face", name: "Sunglasses", price: 50, wear: { shades: true } },
  { id: "wear-tee", shelf: "Clothes", slot: "top", name: "Oat t-shirt", price: 70, wear: { shirt: "#f4efe0" } },
  { id: "wear-tee-red", shelf: "Clothes", slot: "top", name: "Red t-shirt", price: 70, wear: { shirt: "#d0533f" } },
  { id: "wear-scarf", shelf: "Clothes", slot: "neck", name: "Stripy scarf", price: 60, wear: { scarf: "#d0533f" } },
  { id: "wear-cap", shelf: "Clothes", slot: "hat", name: "Cap", price: 60, wear: { hat: "cap", hatColour: "#2f5f9e" } },
  { id: "wear-beanie", shelf: "Clothes", slot: "hat", name: "Beanie", price: 60, wear: { hat: "beanie", hatColour: "#c9832c" } },
  { id: "wear-phones", shelf: "Clothes", slot: "hat", name: "Headphones", price: 110, wear: { hat: "phones" } },
  { id: "wear-tophat", shelf: "Clothes", slot: "hat", name: "Top hat", price: 180, wear: { hat: "tophat" } },
];

export const SHELVES: Shelf[] = ["Clothes", "Shells", "Screens", "Paints"];
export const ITEM: Record<string, Item> = Object.fromEntries(CATALOGUE.map((i) => [i.id, i]));
// Everyone starts with these.
export const FREE = CATALOGUE.filter((i) => i.price === 0).map((i) => i.id);

// What Pickle has on, one item per slot (pets.worn).
export type Worn = Partial<Record<Slot, string>>;

// How Pickle looks given what he's wearing: the casing, the screen, his body colour and clothes.
export type Look = { shell: Item["shell"]; screen: NonNullable<Item["screen"]>; paint: string | null; wear: Wear };
export function lookOf(worn: Worn | null | undefined): Look {
  const w = worn ?? {};
  const pick = (s: Slot) => (w[s] && ITEM[w[s]!]?.slot === s ? ITEM[w[s]!] : undefined);
  const screen = pick("screen")?.screen ?? "classic";
  const wear: Wear = {};
  for (const s of ["hat", "face", "top", "neck"] as const) Object.assign(wear, pick(s)?.wear);
  return { shell: (pick("shell") ?? ITEM["shell-oat"]).shell, screen, paint: screen === "colour" ? pick("paint")?.paint ?? null : null, wear };
}
