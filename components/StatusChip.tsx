import { type Ctx, stageColor, stageOf } from "@/lib/priority";
import type { Status } from "@/lib/types";

export default function StatusChip({ status, ctx }: { status: Status; ctx: Ctx }) {
  const s = stageOf(ctx, status);
  const color = stageColor(s?.color ?? "blue");
  return (
    <span className="chip" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {s?.label ?? status}
    </span>
  );
}
