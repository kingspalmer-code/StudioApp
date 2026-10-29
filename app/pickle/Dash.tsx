"use client";

import { useEffect, useRef, useState } from "react";
import type { PetView } from "@/lib/pet";
import { INK, pickleSvg } from "@/lib/pickle/art";
import { GAMES, GAME_CAP, type Look } from "@/lib/pickle/catalogue";
import { payPickleGame } from "./actions";

// Pickle Dash: the dinosaur game, with Pickle. Jump the forks, grab the oatcakes. Bumping a fork
// just ends the run; whatever you scored turns into oatcakes (GAMES.dash in the catalogue).
// Space, a click or a tap jumps. Tuning lives in TUNE so it can be changed in one place.
const TUNE = { w: 320, h: 96, ground: 80, start: 2.2, top: 5, ramp: 1400, gravity: 0.32, jump: 5.4, gap: [50, 120], cakeEvery: 0.3, cakePoints: 25 };
const SCREEN: Record<Look["screen"], string> = { classic: "#b4b9a2", amber: "#c9b77e", ice: "#a9bcc0", colour: "#c8d0b6" };

type Thing = { kind: "fork" | "cake"; x: number; h: number; got?: boolean };
type Run = { y: number; vy: number; t: number; speed: number; score: number; things: Thing[]; next: number; state: "ready" | "running" | "over" };
const fresh = (): Run => ({ y: 0, vy: 0, t: 0, speed: TUNE.start, score: 0, things: [], next: 60, state: "ready" });

export default function Dash({ pet, look, font, onPet, onSay }: { pet: PetView; look: Look; font: string; onPet: (p: PetView) => void; onSay: (s: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef<Run>(fresh());
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [paid, setPaid] = useState(pet.gamePaid);
  const sprite = useRef<HTMLImageElement | null>(null);
  const finish = useRef<(s: number) => void>(() => {});

  // Pickle in whatever he's wearing.
  useEffect(() => {
    const img = new Image();
    img.src = "data:image/svg+xml," + encodeURIComponent(pickleSvg({ mood: "happy", feet: true, hat: null, wear: look.wear, paint: look.paint }));
    sprite.current = img;
  }, [look]);

  finish.current = async (s: number) => {
    if (!pet.shop) return setResult(`${s} points. Oatcakes from games start once the shop opens.`);
    const r = await payPickleGame("dash", s);
    if (!r) return;
    onPet(r.pet);
    setPaid(r.pet.gamePaid);
    setResult(r.won ? `${s} points · +${r.won} oatcake${r.won === 1 ? "" : "s"}` : r.pet.gamePaid >= GAME_CAP ? `${s} points · that's today's oatcakes from games` : `${s} points · 100 for an oatcake`);
    if (r.won) onSay(`+${r.won}`);
  };

  useEffect(() => {
    const c = canvas.current!, cx = c.getContext("2d")!;
    const jump = () => {
      const g = run.current;
      if (g.state === "over") { run.current = { ...fresh(), state: "running" }; setResult(null); return; }
      g.state = "running";
      if (g.y === 0) g.vy = TUNE.jump;
    };
    const key = (e: KeyboardEvent) => {
      if (e.code !== "Space" || (e.target as HTMLElement).closest("input, textarea, button")) return;
      e.preventDefault();
      jump();
    };
    const tap = (e: PointerEvent) => { e.preventDefault(); jump(); };
    c.addEventListener("pointerdown", tap);
    addEventListener("keydown", key);

    const fork = (x: number) => { const y = TUNE.ground - 18; cx.fillStyle = INK; cx.fillRect(x + 3, y + 6, 2, 12); [0, 3, 6].forEach((d) => cx.fillRect(x + d, y, 2, 7)); cx.fillRect(x, y + 6, 8, 2); };
    const cake = (x: number, h: number) => { const y = TUNE.ground - h; cx.fillStyle = INK; cx.fillRect(x + 1, y, 5, 1); cx.fillRect(x, y + 1, 7, 5); cx.fillRect(x + 1, y + 6, 5, 1); cx.fillStyle = SCREEN[look.screen]; cx.fillRect(x + 2, y + 2, 1, 1); cx.fillRect(x + 4, y + 3, 1, 1); cx.fillRect(x + 2, y + 4, 1, 1); };
    let raf = 0, shown = -1;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const g = run.current;
      if (g.state === "running") {
        g.t++;
        g.score += g.speed / 6;
        g.speed = Math.min(TUNE.top, TUNE.start + g.t / TUNE.ramp);
        g.vy -= TUNE.gravity;
        g.y = Math.max(0, g.y + g.vy);
        if (g.y === 0) g.vy = 0;
        if (--g.next <= 0) {
          g.things.push(Math.random() < TUNE.cakeEvery ? { kind: "cake", x: TUNE.w + 10, h: 22 + Math.random() * 18 } : { kind: "fork", x: TUNE.w + 10, h: 18 });
          g.next = TUNE.gap[0] + Math.random() * (TUNE.gap[1] - TUNE.gap[0]) - g.speed * 4;
        }
        for (const t of g.things) t.x -= g.speed;
        const feet = TUNE.ground - g.y;
        for (const t of g.things) {
          if (t.kind === "fork" && t.x < 48 && t.x + 8 > 34 && feet > TUNE.ground - 16) {
            g.state = "over";
            finish.current(Math.floor(g.score));
          }
          if (t.kind === "cake" && !t.got && t.x < 52 && t.x + 7 > 30 && feet - 20 < TUNE.ground - t.h + 7 && feet > TUNE.ground - t.h) {
            t.got = true;
            g.score += TUNE.cakePoints;
          }
        }
        g.things = g.things.filter((t) => t.x > -20 && !t.got);
      }
      cx.fillStyle = SCREEN[look.screen];
      cx.fillRect(0, 0, TUNE.w, TUNE.h);
      cx.fillStyle = "rgba(29,32,26,.3)";
      for (let x = -((g.t * g.speed) % 8); x < TUNE.w; x += 8) cx.fillRect(x, TUNE.ground + 1, 4, 1);
      for (const t of g.things) (t.kind === "fork" ? fork(t.x) : cake(t.x, t.h));
      const img = sprite.current;
      if (img?.complete && img.width) {
        const w = 24, h = (img.height / img.width) * w;
        cx.drawImage(img, 28, TUNE.ground - g.y - h + 2, w, h);
      }
      cx.fillStyle = INK;
      cx.font = `8px ${font}, monospace`;
      if (g.state === "ready") cx.fillText("TAP OR SPACE TO RUN", 110, 40);
      if (g.state === "over") cx.fillText("OOF. TAP TO GO AGAIN", 110, 40);
      const s = Math.floor(g.score);
      if (s !== shown) { shown = s; setScore(s); }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); c.removeEventListener("pointerdown", tap); removeEventListener("keydown", key); };
  }, [look.screen, font]);

  return (
    <div className="pw-game">
      <h2>{GAMES.dash.name}</h2>
      <p className="pw-blurb">Space, click or tap to jump the forks. Grab the oatcakes for extra points.</p>
      <canvas ref={canvas} width={TUNE.w} height={TUNE.h} className="pw-canvas" aria-label="Pickle Dash. Press space or tap to jump" />
      <div className="pw-hud">
        <span>Score {score}</span>
        <span>{result ?? `Oatcakes from games today ${paid} / ${GAME_CAP}`}</span>
      </div>
    </div>
  );
}
