import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

/**
 * T10.1/T10.3, specs/02-design.md §10.1-§10.3. Service worker mínimo: sólo lo
 * que hace falta para (a) que el navegador considere la app instalable y
 * (b) recibir avisos push. Nada de estrategia de cache offline — esta app
 * necesita red igual para todo, cachear agresivamente sólo generaría bugs de
 * "versión vieja pegada" en un proyecto que se deployea tan seguido como éste.
 */
precacheAndRoute(self.__WB_MANIFEST);

self.skipWaiting();
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ---------------------------------------------------------------------------
// Push (RF-22, §10.2/§10.5) — el payload lo arma services/notifications.ts en
// la API; acá sólo se muestra tal cual llega.
// ---------------------------------------------------------------------------
interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = { title: 'Liga de Juegos', body: 'Tenés novedades.' };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // Si por algo el payload no es JSON válido, mejor mostrar algo genérico
    // que no mostrar nada — un push sin body en pantalla asusta más que ayuda.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url ?? '/cargar' },
    }),
  );
});

// Tocar la notificación: si ya hay una pestaña de la app abierta, la enfoca y
// navega ahí — no hay razón para abrir una segunda ventana de la misma app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/cargar';
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clientsList.find((c) => 'focus' in c) as WindowClient | undefined;
      if (existing) {
        await existing.focus();
        if ('navigate' in existing) await existing.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
