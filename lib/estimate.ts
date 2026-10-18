// The job time calculator's sums (Apps > Job time calculator). Plain maths on the workspace's own
// past jobs, so the same inputs always give the same answer: the typical time for a type, scaled by
// size when past jobs have one, with a range from how far past jobs strayed from that.

export type Sample = { days: number; size: number | null };

export type Estimate = {
  days: number;
  low: number;
  high: number;
  // How many past jobs it's based on.
  count: number;
  // "size": scaled by size; "typical": the type's usual time.
  how: "size" | "typical";
  // Days per unit of size, when scaled.
  perUnit?: number;
};

// Jobs finished within this long of being added were imported or added already done, so their dates
// say nothing about how long they took.
const INSTANT = 10 * 60 * 1000;

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);

// Working days from adding a job to finishing it, counting both ends (Monday to Wednesday is 3).
// Weekends only count when it was added or finished on one. Null when the dates are no help.
export function workingDays(start: string, end: string): number | null {
  const a = new Date(start);
  const b = new Date(end);
  if (!(b.getTime() - a.getTime() > INSTANT)) return null;
  const from = new Date(`${ymd(a)}T12:00:00Z`);
  const to = new Date(`${ymd(b)}T12:00:00Z`);
  let n = 0;
  for (let d = from; d <= to; d = new Date(d.getTime() + 86400000)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) n++;
  }
  return Math.max(1, n);
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

const median = (xs: number[]) => quantile([...xs].sort((a, b) => a - b), 0.5);

// Half days under 10, whole days after.
export function roundDays(d: number) {
  if (!(d > 0)) return 0.5;
  return d < 10 ? Math.max(0.5, Math.round(d * 2) / 2) : Math.round(d);
}

export function estimate(samples: Sample[], size: number | null): Estimate | null {
  const ok = samples.filter((s) => s.days > 0);
  if (!ok.length) return null;
  const sized = ok.filter((s) => s.size != null && s.size > 0);
  const useSize = size != null && size > 0 && sized.length >= 2;

  let predict: (s: Sample) => number;
  let perUnit: number | undefined;
  let used: Sample[];
  if (useSize) {
    // Typical days per unit, times the size asked about.
    perUnit = median(sized.map((s) => s.days / s.size!));
    predict = (s) => perUnit! * s.size!;
    used = sized;
  } else {
    const typical = median(ok.map((s) => s.days));
    predict = () => typical;
    used = ok;
  }

  const central = useSize ? perUnit! * size! : predict(used[0]);
  // How far each past job was from what this would have said for it.
  const ratios = used.map((s) => s.days / predict(s)).sort((a, b) => a - b);
  const low = central * Math.min(1, quantile(ratios, 0.25));
  const high = central * Math.max(1, quantile(ratios, 0.75));
  return {
    days: roundDays(central),
    low: roundDays(low),
    high: roundDays(high),
    count: used.length,
    how: useSize ? "size" : "typical",
    perUnit,
  };
}

export const dayWord = (d: number) => `${d} ${d === 1 ? "day" : "days"}`;
