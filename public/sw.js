// Oatcake's service worker. It only shows phone alerts (see lib/push.ts) and opens the right
// page when one is tapped; it doesn't cache anything.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let alert = { title: "Oatcake", body: "", url: "/" };
  try {
    alert = { ...alert, ...event.data.json() };
  } catch {
    if (event.data) alert.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(alert.title, {
      body: alert.body,
      tag: alert.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: alert.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => {
      const same = open.find((c) => c.url === url) || open[0];
      if (same) return same.navigate(url).then((c) => (c || same).focus());
      return self.clients.openWindow(url);
    })
  );
});
