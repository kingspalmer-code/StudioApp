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

// Smart grouping, within a day's notifications (newest first):
// - the same person doing the same thing to the same job again (two notes in a row) is one card;
// - requests, files, drafts and other moves from several people or on several jobs stack into one
//   card that opens up;
// - notes, replies and approvals are never stacked with other people's: those are the messages.
export type Card = { key: string; kind: "one" | "stack"; items: Notification[] };

const MESSAGES = new Set<NotificationKind>(["note", "draft_note", "approval"]);
export const isMessage = (n: Pick<Notification, "kind">) => MESSAGES.has(n.kind);

export function stackUp(list: Notification[]): Card[] {
  const cards: Card[] = [];
  const same = new Map<string, Card>();
  const stacks = new Map<string, Card>();
  for (const n of list) {
    const one = `${n.kind}:${n.ticket_id}:${n.actor_name}`;
    const existing = same.get(one);
    if (existing) {
      existing.items.push(n);
      continue;
    }
    if (!isMessage(n)) {
      const stack = stacks.get(n.kind);
      if (stack) {
        stack.items.push(n);
        stack.kind = "stack";
        same.set(one, stack);
        continue;
      }
    }
    const card: Card = { key: `${n.id}`, kind: "one", items: [n] };
    cards.push(card);
    same.set(one, card);
    if (!isMessage(n)) stacks.set(n.kind, card);
  }
  // A card whose items are all one person on one job reads as one thing, however many there are.
  for (const c of cards) if (c.kind === "stack" && new Set(c.items.map((n) => `${n.ticket_id}:${n.actor_name}`)).size === 1) c.kind = "one";
  return cards;
}

// "Dylan Stott", "Dylan Stott and Laura Hedley-White", "Dylan Stott and 4 others".
export function people(items: Notification[]) {
  const names = [...new Set(items.map((n) => n.actor_name))];
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

// What a stack of several jobs says: "sent 7 new requests".
export function stackPhrase(kind: NotificationKind, jobs: number): string {
  switch (kind) {
    case "request": return `sent ${jobs} new requests`;
    case "follow_up": return `asked for ${jobs} follow-ups`;
    case "job": return `added ${jobs} jobs`;
    case "files": return `added files to ${jobs} jobs`;
    case "draft": return `shared ${jobs} drafts`;
    case "review": return `sent ${jobs} jobs for review`;
    case "finished": return `finished ${jobs} jobs`;
    default: return `did ${jobs} things`;
  }
}
