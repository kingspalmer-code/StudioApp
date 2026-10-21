// What goes on the Queue and Overview pages, and in what order. Each page is a stack of blocks the
// owner (or a manager) can remove, add back and reorder with Customise (components/PageBlocks.tsx).
// Any block can go on either page. The choice is saved to the account (user_metadata layout_queue /
// layout_overview), so it follows them from the computer to the phone.
export type PageKey = "queue" | "overview";
export type BlockId = "widgets" | "upnext" | "board" | "totals" | "clients" | "risk" | "delivered";

// `half` blocks sit side by side when two come one after the other.
export const BLOCKS: Record<BlockId, { label: string; hint: string; half?: boolean }> = {
  widgets: { label: "Widgets", hint: "Pickle, the week ahead, fresh work and more" },
  upnext: { label: "Up next", hint: "Everything open, in the order to start it" },
  board: { label: "Board", hint: "Every job in a column for its stage" },
  totals: { label: "Totals", hint: "Open, due or unpaid, at risk and delivered" },
  clients: { label: "By client", hint: "Each client's work split by stage" },
  risk: { label: "At risk", hint: "Jobs that should have started already", half: true },
  delivered: { label: "Delivered recently", hint: "The last ten finished", half: true },
};

export const layoutKey = (page: PageKey) => `layout_${page}`;

// What each page shows until someone customises it: the pages as they were before.
export function defaultLayout(page: PageKey, role: string): BlockId[] {
  if (page === "queue") return role === "designer" ? ["widgets", "upnext"] : ["upnext"];
  return [...(role === "manager" ? (["widgets"] as BlockId[]) : []), "totals", "clients", "risk", "delivered"];
}

// The saved order, keeping only blocks this login can have here; nothing saved means the default.
export function layoutFor(saved: unknown, page: PageKey, role: string, available: BlockId[]): BlockId[] {
  const list = Array.isArray(saved) ? saved.filter((x): x is BlockId => typeof x === "string" && x in BLOCKS) : defaultLayout(page, role);
  return [...new Set(list)].filter((id) => available.includes(id));
}
