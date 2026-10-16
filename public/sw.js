// Day Vlog service worker: shows hourly drop notifications and opens the right screen on tap.
// It deliberately caches nothing, so a deploy is live the next time the app opens.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Day Vlog";
  const options = {
    body: data.body || "New drop!",
    icon: "/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/" },
  };
  // iOS cancels push permission for apps that receive pushes without showing anything,
  // so if the full notification fails for any reason, show a plain one instead.
  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .catch(() => self.registration.showNotification(title, { body: options.body, data: options.data })),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
