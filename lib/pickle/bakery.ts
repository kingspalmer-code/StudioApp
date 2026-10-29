// Pickle's Bakery (app/pickle/Bakery.tsx): a little working game. Knead dough, the ovens bake it
// into loaves, shoppers come in and buy them for crumbs, and crumbs buy more ovens, a helper and
// a bigger sign. Crumbs stay in the bakery; cashing up turns CRUMBS_PER_OATCAKE of them into an
// oatcake, up to CASH_CAP a day, so the bakery is a treat and never out-earns real work.
// Saved on Pickle's row (pets.bakery, migration 054).
export type Bakery = {
  crumbs: number;
  dough: number;
  loaves: number;
  sold: number;
  ovens: number;
  helper: number;
  sign: number;
  cashed: number; // oatcakes cashed up on `day`
  day: string; // London day
};

export const LOAF_PRICE = 5;
export const CRUMBS_PER_OATCAKE = 100;
export const CASH_CAP = 10;
// How long an oven takes to bake a loaf, and how often a helper kneads, in seconds.
export const BAKE_SECONDS = 3;
export const HELPER_SECONDS = 4;

export const UPGRADES: { key: "ovens" | "helper" | "sign"; name: string; blurb: string; max: number; cost: (b: Bakery) => number }[] = [
  { key: "ovens", name: "Another oven", blurb: "Bakes another loaf at a time", max: 4, cost: (b) => 40 * b.ovens ** 2 },
  { key: "helper", name: "Hire a helper", blurb: "Kneads dough for you", max: 2, cost: (b) => 60 * (b.helper + 1) ** 2 },
  { key: "sign", name: "A bigger sign", blurb: "More shoppers come in", max: 3, cost: (b) => 50 * (b.sign + 1) ** 2 },
];

export const freshBakery = (day: string): Bakery => ({ crumbs: 0, dough: 3, loaves: 1, sold: 0, ovens: 1, helper: 0, sign: 0, cashed: 0, day });

// Whatever was saved (or sent from the browser), as a sensible bakery: whole numbers, nothing
// past its limits, and never more crumbs than the loaves sold could have made. A new day resets
// what's been cashed up.
export function cleanBakery(raw: unknown, day: string): Bakery {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Bakery, unknown>>;
  const n = (v: unknown, max: number, min = 0) => Math.min(max, Math.max(min, Math.floor(Number(v) || 0)));
  const base = freshBakery(day);
  if (!("ovens" in r)) return base;
  const sold = n(r.sold, 1e7);
  return {
    crumbs: Math.min(n(r.crumbs, 1e7), sold * LOAF_PRICE),
    dough: n(r.dough, 9999),
    loaves: n(r.loaves, 9999),
    sold,
    ovens: n(r.ovens, UPGRADES[0].max, 1),
    helper: n(r.helper, UPGRADES[1].max),
    sign: n(r.sign, UPGRADES[2].max),
    cashed: r.day === day ? n(r.cashed, CASH_CAP) : 0,
    day,
  };
}

// How many oatcakes cashing up would give right now.
export const cashable = (b: Bakery) => Math.max(0, Math.min(CASH_CAP - b.cashed, Math.floor(b.crumbs / CRUMBS_PER_OATCAKE)));
