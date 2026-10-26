// The filing drawer (/filing): every finished job, filed behind a divider for the month it was
// finished in. Shared by the page, the drawer and the file a job opens into.

const TZ = process.env.NEXT_PUBLIC_TIMEZONE || "Europe/London";
const YM = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" });

// "2026-10" for a moment, in the studio's timezone.
export const monthKey = (iso: string) => YM.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)).slice(0, 7);

export function monthName(key: string, style: "long" | "short" = "long") {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: style, timeZone: "UTC" });
}

// One job card in the drawer.
export type FiledJob = {
  id: number;
  title: string;
  type: string;
  biz: string;
  finished: string;
  cover: string | null;
  files: number;
  amount: number | null;
};

// One divider: the month, and the jobs filed behind it, newest first.
export type FiledMonth = { key: string; jobs: FiledJob[] };

// Everything in a job's file, read when it's opened.
export type JobFile = {
  id: number;
  title: string;
  type: string;
  biz: string;
  status: string;
  started: string;
  finished: string;
  details: { title: string | null; rows: { label: string; value: string; long: boolean }[] }[];
  docs: { id: number; name: string; status: string; total: string; issued: string }[];
  images: { name: string; path: string | null; view: string | null; download: string | null }[];
  others: { name: string; size: string; download: string | null }[];
  refs: { name: string; view: string | null }[];
  notes: { who: string; when: string; body: string; approval: boolean }[];
  hours: string | null;
};
