import { brandFor } from "@/lib/brands";
import type { Business } from "@/lib/types";

// A business's logo on its own tile colour. `size` is the height; the tile is 1.5× as wide
// so wordmark logos stay legible. `wide` lets the logo set its own width (headers).
export default function BizBadge({ biz, size = 28, wide = false }: { biz?: Business; size?: number; wide?: boolean }) {
  const width = wide ? undefined : Math.round(size * 1.5);
  // No business: a solo project, which belongs to nobody.
  if (!biz) return null;
  const b = brandFor(biz);
  return (
    <span
      className={wide ? "badge wide" : "badge"}
      title={b.name}
      style={{ width, height: size, background: b.tile, color: b.ink, fontSize: size * 0.38 }}
    >
      {b.logo ? <img src={b.logo} alt={b.name} /> : <span aria-hidden="true">{b.monogram}</span>}
    </span>
  );
}
