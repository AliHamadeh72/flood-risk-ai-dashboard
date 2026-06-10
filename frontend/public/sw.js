self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "High flood-risk dataset update", body: event.data.text() };
  }

  if (payload.risk_label && payload.risk_label !== "High") return;

  const title = payload.title || "High flood-risk dataset update";
  const body =
    payload.body ||
    `${payload.region_name || "Updated cadaster"} has a high flood-risk alert.`;
  const url = payload.url || self.registration.scope;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: payload.icon,
      badge: payload.badge,
      data: { url },
      tag: payload.tag || `flood-alert:${payload.region_id || "updated"}:${payload.date || Date.now()}`
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
