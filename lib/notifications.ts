// The bell's notifications: rows written by the database whenever someone else does something on
// a job you're part of (see supabase/migrations/022_notifications.sql). Shared by the bell's panel
// and the full Notifications page.

export type NotificationKind = "request" | "follow_up" | "job" | "note" | "draft_note" | "approval" | "files" | "draft" | "review" | "finished";

export type Notification = {
  id: number;
  ticket_id: number | null;
  kind: NotificationKind;
  title: string;
  actor_name: string;
  actor_avatar: string | null;
  body: string;
  count: number;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
};

export const NOTIFICATION_COLUMNS = "id, ticket_id, kind, title, actor_name, actor_avatar, body, count, read_at, archived_at, created_at";

// "<Kingsley> <shared a draft of> <Spring menu>": the words either side of the job's name.
export function phrase(n: Pick<Notification, "kind" | "count">): [string, string] {
  switch (n.kind) {
    case "request": return ["sent a new request:", ""];
    case "follow_up": return ["asked for a follow-up to", ""];
    case "job": return ["added", ""];
    case "note": return ["commented on", ""];
    case "draft_note": return ["left notes on a draft of", ""];
    case "approval": return ["approved a draft of", ""];
    case "files": return [n.count > 1 ? `added ${n.count} files to` : "added a file to", ""];
    case "draft": return ["shared a draft of", ""];
    case "review": return ["sent", "for review"];
    case "finished": return ["finished", ""];
  }
}

// Where tapping it goes: the part of the job page it's about.
export function hrefFor(n: Pick<Notification, "kind" | "ticket_id">) {
  if (!n.ticket_id) return "/notifications";
  const spot = n.kind === "note" ? "#notes" : n.kind === "draft_note" || n.kind === "approval" || n.kind === "draft" ? "#drafts" : n.kind === "files" ? "#files" : "";
  return `/tickets/${n.ticket_id}${spot}`;
}

const TZ = process.env.NEXT_PUBLIC_TIMEZONE || "Europe/London";
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const WHEN = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export const dayKey = (d: Date) => DAY.format(d);
export const whenLabel = (iso: string) => WHEN.format(new Date(iso)).replace(" at ", " · ");

// Today, Yesterday, then Earlier, newest first, leaving out empty groups.
export function groupByDay<T extends { created_at: string }>(list: T[], now = new Date()): { label: string; items: T[] }[] {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86400000));
  const groups = [
    { label: "Today", items: [] as T[] },
    { label: "Yesterday", items: [] as T[] },
    { label: "Earlier", items: [] as T[] },
  ];
  for (const n of list) {
    const k = dayKey(new Date(n.created_at));
    groups[k === today ? 0 : k === yesterday ? 1 : 2].items.push(n);
  }
  return groups.filter((g) => g.items.length);
}

export const initialsOf = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
