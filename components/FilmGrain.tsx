"use client";

import { useEffect, useRef } from "react";

// Film grain for the dark sign-in screens. Like real film, every frame is a brand new random
// scatter of grain (hard cuts at 24fps, no sliding). A dozen noise tiles are made once, then each
// frame picks a different one at a random offset. Brightness only, no colour.
const FPS = 24;
const TILE = 256;
const FRAMES = 12;
const STRENGTH = 0.12; // how far a grain can lighten or darken the background

function makeTile() {
  const c = document.createElement("canvas");
  c.width = c.height = TILE;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(TILE, TILE);
  const px = new Uint32Array(img.data.buffer);
  for (let i = 0; i < px.length; i++) {
    // Roughly gaussian, centred on zero: most grains are faint, a few stand out.
    const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const a = Math.min(255, Math.abs(g) * STRENGTH * 2 * 255) | 0;
    const v = g > 0 ? 255 : 0;
    px[i] = (a << 24) | (v << 16) | (v << 8) | v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export default function FilmGrain() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const patterns = Array.from({ length: FRAMES }, () => ctx.createPattern(makeTile(), "repeat")!);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last = -1;

    const draw = () => {
      let n = Math.floor(Math.random() * FRAMES);
      if (n === last) n = (n + 1) % FRAMES;
      last = n;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(-Math.floor(Math.random() * TILE), -Math.floor(Math.random() * TILE));
      ctx.fillStyle = patterns[n];
      ctx.fillRect(0, 0, canvas.width + TILE, canvas.height + TILE);
    };
    const size = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      draw();
    };
    size();
    window.addEventListener("resize", size);
    if (still) return () => window.removeEventListener("resize", size);

    // requestAnimationFrame stops by itself while the tab is hidden.
    let raf = 0;
    let prev = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - prev < 1000 / FPS - 2) return;
      prev = t;
      draw();
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
    };
  }, []);

  return <canvas ref={ref} className="film-grain" aria-hidden="true" />;
}
