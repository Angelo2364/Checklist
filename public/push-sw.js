// Trecho extra do Service Worker, só para os avisos push.
// O sw.js principal (cache/offline) é gerado sozinho no build pelo plugin de PWA;
// este arquivo é anexado a ele pela opção workbox.importScripts do vite.config.js.

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { titulo: "Checklist", corpo: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.titulo || "Checklist", {
      body: d.corpo || "",
      tag: d.tag || undefined,
      renotify: !!(d.tag && d.renotify),
      requireInteraction: !!d.requireInteraction,
      vibrate: d.vibrate || undefined,
      icon: "/pwa-192.png",
    })
  );
});

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
