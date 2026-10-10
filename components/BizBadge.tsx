import { brandFor } from "@/lib/brands";
import type { Business } from "@/lib/types";

export default function BizBadge({ biz, size = 28 }: { biz?: Business; size?: number }) {
  if (!biz) return <span className="badge" style={{ width: size, height: size }} />;
  const b = brandFor(biz);
  return (
    <span
      className="badge"
      title={b.name}
      style={{ width: size, height: size, background: b.logo ? "var(--surface)" : b.color, color: b.ink, fontSize: size * 0.38 }}
    >
      {b.logo ? <img src={b.logo} alt={b.name} /> : <span aria-hidden="true">{b.monogram}</span>}
    </span>
  );
}
