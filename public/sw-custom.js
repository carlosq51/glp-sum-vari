// sw-custom.js — processed by VitePWA (injectManifest mode)
// Workbox injects self.__WB_MANIFEST at build time.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { createHandlerBoundToURL } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// El fallback de navegación devuelve index.html para que la PWA funcione
// offline. denylist saca las páginas que NO son parte de la SPA: son HTML
// autónomos servidos por Express (routes/despacho.js) y deben llegar a la red.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
  denylist: [/^\/tv(\/|$|\?)/, /^\/marcar(\/|$|\?)/, /^\/despacho(\/|$|\?)/],
}));

self.skipWaiting();
self.addEventListener('activate', e => e.waitUntil(
  self.clients.claim().then(() =>
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => Promise.all(clients.map(c => c.navigate(c.url).catch(() => {}))))
  )
));

// ── Push: mostrar notificación cuando el backend avisa ───────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: '🔩 Ramal listo', body: event.data.text() }; }

  const title = payload.title || '🔩 Tu ramal está listo';
  const options = {
    body:      payload.body  || 'Acércate a recoger tu ramal.',
    icon:      '/pwa-192.png',
    badge:     '/pwa-192.png',
    tag:       payload.tag  || 'ramal-push',
    renotify:  true,
    vibrate:   Array.isArray(payload.vibrate) && payload.vibrate.length ? payload.vibrate : [200, 100, 200],
    data:      { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Click en la notificación → enfocar o abrir la app ───────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        const open = clients.find(c => 'focus' in c);
        return open ? open.focus() : self.clients.openWindow(target);
      })
  );
});
