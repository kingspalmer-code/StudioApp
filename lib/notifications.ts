// The bell's notifications: rows written by the database whenever someone else does something on
// a job you're part of (see supabase/migrations/022_notifications.sql). Shared by the bell's panel
// and the full Notifications page.

export type NotificationKind =
  | "request" | "follow_up" | "job" | "note" | "draft_note" | "approval" | "files" | "draft" | "review" | "finished"
  // About an employee's task (Team and To-do) rather than a job.
  | "task" | "task_note" | "task_signoff" | "task_confirmed" | "task_reopened"
  // About something on the calendar.
  | "plan" | "reminder"
  // Tagged on something added to the Gallery.
  | "tagged";

export type Notification = {
  id: number;
  ticket_id: number | null;
  staff_task_id?: number | null;
  plan_item_id?: number | null;
  gallery_item_id?: number | null;
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

export const NOTIFICATION_COLUMNS = "id, ticket_id, staff_task_id, plan_item_id, gallery_item_id, kind, title, actor_name, actor_avatar, body, count, read_at, archived_at, created_at";

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
    case "task": return ["gave you a task:", ""];
    case "task_note": return ["replied on", ""];
    case "task_signoff": return ["finished", "and asked you to sign it off"];
    case "task_confirmed": return ["signed off", ""];
    case "task_reopened": return ["sent back", ""];
    case "plan": return ["put on your calendar:", ""];
    case "reminder": return ["reminder:", ""];
    case "tagged": return ["tagged you in", ""];
  }
}

// Where tapping it goes: the part of the job page it's about.
// Notes and drafts also carry when it happened, so the job page can scroll to that exact one
// (app/tickets/[id]/JumpTo.tsx).
export function hrefFor(n: Pick<Notification, "kind" | "ticket_id" | "staff_task_id" | "plan_item_id" | "gallery_item_id" | "created_at">) {
  if (n.gallery_item_id) return `/gallery/${n.gallery_item_id}`;
  if (n.plan_item_id) return `/calendar?item=${n.plan_item_id}`;
  if (n.staff_task_id) return `/tasks/${n.staff_task_id}`;
  if (!n.ticket_id) return "/notifications";
  const spot = n.kind === "note" ? "#notes" : n.kind === "draft_note" || n.kind === "approval" || n.kind === "draft" ? "#drafts" : n.kind === "files" ? "#files" : "";
  const exact = ["note", "draft_note", "approval", "draft"].includes(n.kind) && n.created_at ? `?at=${encodeURIComponent(n.created_at)}` : "";
  return `/tickets/${n.ticket_id}${exact}${spot}`;
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
// What a notification is about: a job, an employee's task, something on the calendar, or in the Gallery.
export const refOf = (n: Pick<Notification, "ticket_id" | "staff_task_id" | "plan_item_id" | "gallery_item_id">) =>
  n.ticket_id ?? (n.staff_task_id ? `t${n.staff_task_id}` : n.gallery_item_id ? `g${n.gallery_item_id}` : `p${n.plan_item_id}`);

export type Card = { key: string; kind: "one" | "stack"; items: Notification[] };

const MESSAGES = new Set<NotificationKind>(["note", "draft_note", "approval", "task_note", "task_signoff", "task_reopened"]);
export const isMessage = (n: Pick<Notification, "kind">) => MESSAGES.has(n.kind);

export function stackUp(list: Notification[]): Card[] {
  const cards: Card[] = [];
  const same = new Map<string, Card>();
  const stacks = new Map<string, Card>();
  for (const n of list) {
    const one = `${n.kind}:${refOf(n)}:${n.actor_name}`;
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
  for (const c of cards) if (c.kind === "stack" && new Set(c.items.map((n) => `${refOf(n)}:${n.actor_name}`)).size === 1) c.kind = "one";
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
    case "task": return `gave you ${jobs} tasks`;
    case "task_confirmed": return `signed off ${jobs} tasks`;
    case "plan": return `put ${jobs} things on your calendar`;
    case "reminder": return `${jobs} reminders`;
    case "tagged": return `tagged you in ${jobs} things`;
    default: return `did ${jobs} things`;
  }
}
