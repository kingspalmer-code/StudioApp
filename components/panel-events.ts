// Opening the search and the Create menu from anywhere. Both panels load a moment after the page
// does (components/LazyPanels.tsx), so a tap or key that comes before they've arrived is kept
// and they open as soon as they're ready.
export const SEARCH_EVENT = "oc-search";
export const CREATE_EVENT = "oc-create";

const pending = new Set<string>();

function open(name: string) {
  pending.add(name);
  window.dispatchEvent(new Event(name));
}

export const openSearch = () => open(SEARCH_EVENT);
export const openCreate = () => open(CREATE_EVENT);

// A panel calls this when it opens (so the request counts as handled) and once it's listening
// (true if someone asked for it before it arrived).
export function takePending(name: string) {
  return pending.delete(name);
}
