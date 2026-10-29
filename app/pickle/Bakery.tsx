"use client";

import { useEffect, useRef, useState } from "react";
import type { PetView } from "@/lib/pet";
import { pickleSvg } from "@/lib/pickle/art";
import { BAKE_SECONDS, CASH_CAP, CRUMBS_PER_OATCAKE, HELPER_SECONDS, LOAF_PRICE, UPGRADES, cashable, type Bakery as State } from "@/lib/pickle/bakery";
import type { Look } from "@/lib/pickle/catalogue";
import { savePickleBakery } from "./actions";

// Pickle's Bakery, drawn as a little pixel shop: ovens along the back that glow while they bake,
// a shelf the loaves stack up on, the dough table (tap it to knead), Pickle at the counter and
// faceless shoppers who walk in, buy a loaf and leave. The rules and prices are in
// lib/pickle/bakery.ts; this only plays it, and saves now and then.
const W = 320, H = 150, FPS = 60;
const C = { wall: "#efe0c2", wall2: "#e6d2ad", floor: "#c39a6b", floor2: "#b48a5c", wood: "#8a5a3b", wood2: "#6e4529", oven: "#5d6169", oven2: "#45484f", glow: "#f2a541", bread: "#d99a4e", crust: "#a8662a", ink: "#2a201c", cream: "#fbf6ea", dough: "#f3e6c9", sky: "#a8c8e6", apron: "#f4efe0" };
const SHOPPERS = ["#d0533f", "#2f5f9e", "#3f8f4f", "#94508f", "#c9832c", "#2f8a86"];
const COUNTER = 236; // where the first shopper in the queue stands
type Shopper = { x: number; colour: string; state: "in" | "wait" | "out"; wait: number; got?: boolean };
type Puff = { x: number; y: number; t: number; text: string };

export default function Bakery({ pet, look, font, onPet, onSay }: { pet: PetView; look: Look; font: string; onPet: (p: PetView) => void; onSay: (s: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<State>({ ...pet.bakery });
  const dirty = useRef(false);
  const puffs = useRef<Puff[]>([]);
  const [shown, setShown] = useState<State>(game.current);
  const [busy, setBusy] = useState(false);
  const show = () => { dirty.current = true; setShown({ ...game.current }); };

  const save = async (cash = false) => {
    if (!pet.shop || (!dirty.current && !cash)) return null;
    dirty.current = false;
    const r = await savePickleBakery(game.current, cash);
    if (r) onPet(r.pet);
    return r;
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Save every so often while playing, and on the way out.
  useEffect(() => {
    const t = setInterval(() => saveRef.current(), 15_000);
    const away = () => saveRef.current();
    addEventListener("pagehide", away);
    return () => { clearInterval(t); removeEventListener("pagehide", away); saveRef.current(); };
  }, []);

  const knead = () => {
    game.current.dough++;
    puffs.current.push({ x: 40 + Math.random() * 20, y: 82, t: 0, text: "+1" });
    show();
  };
  const buy = (key: (typeof UPGRADES)[number]["key"]) => {
    const u = UPGRADES.find((x) => x.key === key)!, g = game.current, cost = u.cost(g);
    if (g[key] >= u.max || g.crumbs < cost) return;
    g.crumbs -= cost;
    g[key]++;
    onSay(u.name.toLowerCase().replace(/^an? /, "") + "!");
    show();
    save();
  };
  const cashUp = async () => {
    setBusy(true);
    const r = await save(true);
    setBusy(false);
    if (r?.won) {
      game.current = { ...r.pet.bakery };
      setShown(r.pet.bakery);
      onSay(`+${r.won}`);
    }
  };

  useEffect(() => {
    const c = canvas.current!, x = c.getContext("2d")!;
    const img = new Image();
    img.src = "data:image/svg+xml," + encodeURIComponent(pickleSvg({ mood: "happy", feet: false, hat: null, wear: look.wear, paint: look.paint }));
    const R = (col: string, a: number, b: number, w: number, h: number) => { x.fillStyle = col; x.fillRect(Math.round(a), Math.round(b), w, h); };
    const loaf = (a: number, b: number) => { R(C.ink, a + 1, b, 8, 1); R(C.ink, a, b + 1, 10, 5); R(C.bread, a + 1, b + 1, 8, 4); R(C.crust, a + 2, b + 2, 1, 2); R(C.crust, a + 5, b + 2, 1, 2); R(C.crust, a + 8, b + 2, 1, 1); };
    const text = (s: string, a: number, b: number, size = 7, align: CanvasTextAlign = "start") => { x.font = `${size}px ${font}, monospace`; x.textAlign = align; x.fillText(s, a, b); x.textAlign = "start"; };
    const shoppers: Shopper[] = [];
    const ovenT = [0, 0, 0, 0];
    let spawnIn = 40, tick = 0, raf = 0;
    const tap = (e: PointerEvent) => { const r = c.getBoundingClientRect(); if (((e.clientX - r.left) / r.width) * W < 90) knead(); };
    c.addEventListener("pointerdown", tap);

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const g = game.current;
      tick++;
      // Ovens turn one dough each into a loaf every BAKE_SECONDS.
      for (let i = 0; i < g.ovens; i++) {
        if (g.dough > 0 || ovenT[i] > 0) ovenT[i]++;
        if (ovenT[i] >= BAKE_SECONDS * FPS) {
          ovenT[i] = 0;
          if (g.dough > 0) { g.dough--; g.loaves++; puffs.current.push({ x: 10 + i * 30, y: 34, t: 0, text: "loaf!" }); show(); }
        }
      }
      if (g.helper && tick % Math.round((HELPER_SECONDS * FPS) / g.helper) === 0) { g.dough++; show(); }
      // Shoppers come in through the door, queue at the counter, buy a loaf and go. A bigger sign brings more.
      if (--spawnIn <= 0 && shoppers.length < 4) {
        shoppers.push({ x: W + 10, colour: SHOPPERS[Math.floor(Math.random() * SHOPPERS.length)], state: "in", wait: 0 });
        spawnIn = Math.max(60, 260 - g.sign * 60 + Math.random() * 120);
      }
      let queue = 0;
      for (const s of shoppers) {
        if (s.state === "in") {
          const spot = COUNTER + queue * 18;
          s.x = Math.max(spot, s.x - 0.8);
          if (s.x <= COUNTER) s.state = "wait";
          queue++;
        } else if (s.state === "wait") {
          queue++;
          s.wait++;
          if (s.wait > 40 && g.loaves > 0) {
            g.loaves--; g.sold++; g.crumbs += LOAF_PRICE;
            s.got = true; s.state = "out";
            puffs.current.push({ x: 238, y: 76, t: 0, text: `+${LOAF_PRICE}` });
            show();
          } else if (s.wait > 360) s.state = "out";
        } else s.x += 1.1;
      }
      for (let i = shoppers.length - 1; i >= 0; i--) if (shoppers[i].x > W + 20) shoppers.splice(i, 1);

      // Wall and floor.
      R(C.wall, 0, 0, W, 120);
      for (let y = 8; y < 120; y += 12) R(C.wall2, 0, y, W, 1);
      R(C.floor, 0, 120, W, 30);
      for (let a = 0; a < W; a += 16) R(C.floor2, a + ((a / 16) % 2) * 8, 120, 1, 30);
      R(C.ink, 0, 120, W, 1);
      // Door, and the sign above it (bigger with each upgrade).
      R(C.ink, 284, 44, 30, 77); R(C.wood, 286, 46, 26, 74); R(C.sky, 290, 52, 18, 20); R(C.glow, 306, 84, 3, 3);
      const sw = 40 + g.sign * 10;
      R(C.ink, 292 - sw / 2 - 1, 22 - g.sign * 2, sw + 2, 14 + g.sign * 2); R(C.cream, 292 - sw / 2, 23 - g.sign * 2, sw, 12 + g.sign * 2);
      x.fillStyle = C.ink; text("BAKERY", 292, 32, 7 + g.sign, "center");
      // Ovens along the back, glowing while they bake, a loaf appearing halfway.
      for (let i = 0; i < g.ovens; i++) {
        const a = 6 + i * 30, b = 38, t = ovenT[i];
        R(C.ink, a, b, 28, 40); R(C.oven, a + 1, b + 1, 26, 38); R(C.oven2, a + 1, b + 30, 26, 9);
        R(C.ink, a + 5, b + 8, 18, 16); R(t > 0 ? C.glow : C.oven2, a + 6, b + 9, 16, 14);
        R(C.ink, a + 10, b + 3, 8, 2);
        if (t > 0) { R(C.ink, a + 5, b + 34, 18, 3); R(C.glow, a + 6, b + 35, Math.round((16 * t) / (BAKE_SECONDS * FPS)), 1); if (t > (BAKE_SECONDS * FPS) / 2) loaf(a + 9, b + 15); }
      }
      // The shelf of loaves.
      R(C.wood2, 128, 52, 112, 4); R(C.wood2, 128, 30, 112, 4);
      for (let i = 0; i < Math.min(g.loaves, 18); i++) loaf(132 + (i % 9) * 12, i < 9 ? 46 : 24);
      if (g.loaves > 18) { x.fillStyle = C.ink; text(`+${g.loaves - 18}`, 214, 22); }
      // The dough table and bowl.
      R(C.ink, 14, 96, 70, 3); R(C.wood, 15, 97, 68, 4); R(C.ink, 18, 100, 3, 20); R(C.ink, 77, 100, 3, 20);
      R(C.ink, 34, 86, 30, 11); R(C.cream, 35, 87, 28, 9);
      for (let i = 0; i < Math.min(g.dough, 5); i++) R(C.dough, 37 + i * 5, 84 - (i % 2) * 2, 5, 4);
      // The helper, a faceless baker in an apron, rocking as they knead.
      for (let i = 0; i < g.helper; i++) { const a = 88 + i * 16 + Math.sin(tick / 20 + i) * 3; R(C.ink, a, 92, 12, 22); R(C.apron, a + 1, 93, 10, 20); R(C.ink, a + 2, 89, 8, 3); }
      // Pickle behind the counter.
      if (img.complete && img.width) { const w = 34, h = (img.height / img.width) * w; x.drawImage(img, 168, 92 - h + 2 + (tick % 60 < 30 ? 0 : -1), w, h); }
      R(C.ink, 140, 90, 92, 31); R(C.wood, 141, 91, 90, 29); R(C.wood2, 141, 91, 90, 3);
      for (let a = 150; a < 230; a += 20) R(C.wood2, a, 96, 1, 22);
      // Shoppers: a round body in a colour, a little hat, stepping legs, and the loaf they bought.
      for (const s of shoppers) {
        const leg = Math.floor(s.x / 3) % 2;
        R(C.ink, s.x + 1, 101, 12, 1); R(C.ink, s.x, 102, 14, 12); R(s.colour, s.x + 1, 102, 12, 11); R("rgba(0,0,0,.18)", s.x + 9, 104, 3, 9);
        R(C.ink, s.x + 3, 99, 8, 3); R(C.ink, s.x + 2 + leg, 114, 3, 4); R(C.ink, s.x + 9 - leg, 114, 3, 4);
        if (s.got) loaf(s.x - 4, 106);
      }
      // Little floating words.
      const p = puffs.current;
      for (let i = p.length - 1; i >= 0; i--) {
        p[i].t++;
        x.fillStyle = `rgba(42,32,28,${1 - p[i].t / 60})`;
        text(p[i].text, p[i].x, p[i].y - p[i].t / 3);
        if (p[i].t > 60) p.splice(i, 1);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); c.removeEventListener("pointerdown", tap); };
    // knead and show only touch refs and state setters, so they needn't restart the scene.
  }, [look, font]);

  const g = shown;
  const canCash = cashable(g);
  return (
    <div className="pw-game">
      <h2>Pickle&apos;s Bakery</h2>
      <p className="pw-blurb">Tap the table to knead dough. The ovens bake it, the loaves go on the shelf, and shoppers come in and buy them for crumbs. Spend crumbs on the bakery, or cash up: {CRUMBS_PER_OATCAKE} crumbs make an oatcake, up to {CASH_CAP} a day.</p>
      <canvas ref={canvas} width={W} height={H} className="pw-canvas pw-bake" aria-label="Pickle's Bakery. Tap the table on the left to knead dough" />
      <div className="pw-hud">
        <span>Crumbs {g.crumbs}</span>
        <span>Dough {g.dough} · Loaves {g.loaves} · Sold {g.sold}</span>
      </div>
      <div className="pw-bake-row">
        <button type="button" className="btn small" onClick={knead}>Knead dough</button>
        {UPGRADES.map((u) => {
          const cost = u.cost(g), full = g[u.key] >= u.max;
          return (
            <button key={u.key} type="button" className="btn small plain" disabled={full || g.crumbs < cost} onClick={() => buy(u.key)} title={u.blurb}>
              {u.name} · {full ? "full" : `${cost} crumbs`}
            </button>
          );
        })}
        <button type="button" className="btn small" disabled={busy || !pet.shop || !canCash} onClick={cashUp} title={`${g.cashed} of ${CASH_CAP} cashed up today`}>
          Cash up{canCash ? ` +${canCash}` : ""}
        </button>
      </div>
      {!pet.shop && <p className="pw-soon">The bakery saves and cashes up once the shop opens.</p>}
    </div>
  );
}
