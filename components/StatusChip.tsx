import { STATUSES } from "@/lib/priority";
import type { Status } from "@/lib/types";

export default function StatusChip({ status }: { status: Status }) {
  const s = STATUSES.find((x) => x.id === status)!;
  return (
    <span className="chip" style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 14%, transparent)` }}>
      {s.label}
    </span>
  );
}
