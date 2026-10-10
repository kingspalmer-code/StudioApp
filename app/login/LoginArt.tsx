// Decorative background for the sign-in screen: a big oatcake biscuit and drifting oat flakes.

// A round oatcake: golden bake, darker rim, docking holes and a scatter of oat bits.
export function Oatcake({ size, className, style }: { size: number; className?: string; style?: React.CSSProperties }) {
  const holes: [number, number][] = [];
  for (let row = -3; row <= 3; row++)
    for (let col = -3; col <= 3; col++) {
      const x = col * 26 + (row % 2 ? 13 : 0);
      const y = row * 23;
      if (x * x + y * y < 82 * 82) holes.push([100 + x, 100 + y]);
    }
  const bits = Array.from({ length: 34 }, (_, i) => {
    const a = i * 2.39996;
    const r = 12 + ((i * 37) % 76);
    return { x: 100 + Math.cos(a) * r, y: 100 + Math.sin(a) * r, rot: (i * 53) % 180, w: 2.2 + (i % 3), light: i % 2 === 0 };
  });
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} style={style} aria-hidden="true">
      <defs>
        <radialGradient id="bake" cx="45%" cy="40%" r="65%">
          <stop offset="0" stopColor="#e2b77a" />
          <stop offset=".7" stopColor="#c8955a" />
          <stop offset="1" stopColor="#9b6a3a" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill="#8a5a30" />
      <circle cx="100" cy="100" r="92" fill="url(#bake)" />
      {bits.map((b, i) => (
        <ellipse key={i} cx={b.x} cy={b.y} rx={b.w} ry={b.w * 0.45} transform={`rotate(${b.rot} ${b.x} ${b.y})`} fill={b.light ? "#f1d6a6" : "#9a6634"} opacity=".75" />
      ))}
      {holes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill="#7a4a24" opacity=".8" />
      ))}
    </svg>
  );
}

// Oat flakes scattered across the screen, each drifting gently.
const FLAKES = Array.from({ length: 30 }, (_, i) => ({
  left: (i * 47) % 100,
  top: (i * 29 + 7) % 100,
  size: 10 + ((i * 13) % 16),
  rot: (i * 67) % 360,
  delay: -((i * 1.7) % 12),
  dur: 9 + (i % 5) * 2,
})).filter((f) => !(f.left > 22 && f.left < 78 && f.top > 28 && f.top < 78)); // keep the middle clear for the form

export function Flakes() {
  return (
    <div className="flakes" aria-hidden="true">
      {FLAKES.map((f, i) => (
        <svg
          key={i}
          viewBox="0 0 20 12"
          style={{ left: `${f.left}%`, top: `${f.top}%`, width: f.size, rotate: `${f.rot}deg`, animationDelay: `${f.delay}s`, animationDuration: `${f.dur}s` }}
        >
          <ellipse cx="10" cy="6" rx="9" ry="5" fill="currentColor" />
          <path d="M3 6.5 Q10 4 17 6.5" stroke="#17110f" strokeOpacity=".25" strokeWidth=".8" fill="none" />
        </svg>
      ))}
    </div>
  );
}
