// Usage stats, from the browser. Events queue up here and go to /api/track in small batches.
// Nothing is sent unless the Tracker is on the page (it isn't for people who turned stats off,
// or for an admin viewing someone else's workspace).
export type TrackEvent = { kind: "view" | "time" | "action" | "error"; name?: string; path: string; ms?: number; meta?: Record<string, unknown> };

const queue: TrackEvent[] = [];
let enabled = false;
let timer: ReturnType<typeof setTimeout> | undefined;

// Job and document numbers are folded together, so "/tickets/12" and "/tickets/40" count as one page.
export const normPath = (p: string) =>
  p.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}(?=\/|$)/gi, "/[id]").replace(/\/\d+(?=\/|$)/g, "/[id]").slice(0, 200) || "/";

export function setTracking(on: boolean) {
  enabled = on;
  if (!on) queue.length = 0;
}

export function push(e: TrackEvent) {
  if (!enabled) return;
  queue.push(e);
  clearTimeout(timer);
  timer = setTimeout(flush, 4000);
}

// A named action, such as skipping the walkthrough or asking a question.
export function track(name: string, meta?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  push({ kind: "action", name, path: normPath(location.pathname), meta });
}

export function flush() {
  clearTimeout(timer);
  while (queue.length) {
    const events = queue.splice(0, 40);
    fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }), keepalive: true }).catch(() => {});
  }
}
