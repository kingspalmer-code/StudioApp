"use client";

import { useRef } from "react";

// The handle on the rail's right edge. Drag it out to widen the rail into a sidebar with labels
// and clients; drag it back in (or double-click) to fold it to icons. The width is kept in a
// cookie, which the root layout reads so the page starts at the right width.
const SLIM = 68;
const WIDE = 232;
const MAX = 320;

function apply(width: number) {
  const root = document.documentElement;
  root.style.setProperty("--rail-w", `${width}px`);
  if (width > SLIM) root.dataset.rail = "open";
  else delete root.dataset.rail;
}

function save(width: number) {
  document.cookie = `rail_w=${width}; path=/; max-age=31536000; samesite=lax`;
}

export default function RailGrip() {
  const start = useRef<{ x: number; w: number } | null>(null);

  const current = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue("--rail-w")) || SLIM;
  // Too narrow for labels snaps back to icons only.
  const settle = (w: number) => (w < 150 ? SLIM : Math.min(MAX, Math.round(w)));

  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, w: current() };
    document.documentElement.classList.add("rail-dragging");
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    apply(Math.max(SLIM, Math.min(MAX, start.current.w + e.clientX - start.current.x)));
  }
  function up() {
    if (!start.current) return;
    start.current = null;
    document.documentElement.classList.remove("rail-dragging");
    const w = settle(current());
    apply(w);
    save(w);
  }
  function toggle() {
    const w = current() > SLIM ? SLIM : WIDE;
    apply(w);
    save(w);
  }

  return (
    <div
      className="rail-grip"
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to widen the sidebar"
      title="Drag to widen the sidebar, or double-click"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={toggle}
    />
  );
}
