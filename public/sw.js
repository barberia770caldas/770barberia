// Service worker de 770 Barbería. Dos funciones:
//  1) Habilitar la instalación de la PWA (Chrome exige un SW con manejador
//     'fetch'). No cachea nada: siempre va a la red, así barbero y cliente
//     ven datos frescos de las citas.
//  2) Recibir notificaciones Web Push (nueva cita para el barbero, nuevo
//     contacto para el admin) y mostrarlas aunque la app esté cerrada.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Pass-through: dejamos que el navegador maneje la petición normalmente.
});

// Llega un push del servidor: mostramos la notificación del sistema.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "770 Barbería", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "770 Barbería";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// El navegador renovó la suscripción push internamente (timeout, reinicio del
// SW, actualización del navegador). Debemos re-sincronizar con el servidor para
// que las notificaciones sigan llegando al nuevo endpoint.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldEndpoint = event.oldSubscription
          ? event.oldSubscription.endpoint
          : null;
        const newSub = await self.registration.pushManager.subscribe(
          event.oldSubscription
            ? event.oldSubscription.options
            : { userVisibleOnly: true }
        );
        await fetch("/api/push/resubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oldEndpoint,
            newSubscription: newSub.toJSON(),
          }),
        });
      } catch (err) {
        console.error("pushsubscriptionchange falló:", err);
      }
    })()
  );
});

// El usuario toca la notificación: enfocamos una pestaña abierta o abrimos la URL.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(destino);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(destino);
      })
  );
});
