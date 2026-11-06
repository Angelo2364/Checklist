// Service Worker do checklist: serve para mostrar notificações no celular
// (o Android só aceita registration.showNotification) e para abrir o app ao tocar nelas.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if ("focus" in janela) return janela.focus();
      }
      return self.clients.openWindow("/");
    })
  );
});
