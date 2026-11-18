self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // потрібен для встановлення PWA
self.addEventListener("push", (e) => {
  const d = e.data ? e.data.json() : { title: "Ordo", body: "Нове сповіщення" };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: "/icon-192.png", data: { url: d.url || "/" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data.url));
});
