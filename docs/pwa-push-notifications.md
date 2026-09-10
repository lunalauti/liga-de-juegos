# Notificaciones push para una PWA — guía de implementación

Cómo está armado el sistema de notificaciones push de Liga de Juegos, para poder
replicarlo en otro proyecto. Está escrito para un stack **React + Vite** en el
front y **Node + Express + Postgres** en el back, pero el 80% es estándar web
(Push API, Service Workers, VAPID) y aplica a cualquier stack.

---

## 1. Panorama

```
                    ┌─────────────┐   1. subscribe()      ┌──────────────────┐
   Navegador  ──────│  Service    │──────────────────────▶│  Push Service    │
   (PWA)            │  Worker     │   devuelve endpoint   │  (FCM / Apple /  │
      │             └─────────────┘   + claves p256dh/auth│   Mozilla)       │
      │                    ▲                              └──────────────────┘
      │ 2. POST /push/subscribe                                    ▲
      │    { endpoint, keys }                                      │
      ▼                                                            │ 4. web-push
   ┌─────────────────────┐   3. guarda en                          │    firma con
   │  Tu API (Node)      │──────────────▶  push_subscriptions      │    VAPID y
   │                     │                 (Postgres)              │    manda acá
   │  cron / evento  ────┼────────────────────────────────────────┘
   └─────────────────────┘
                                                            5. el Push Service
                                                               despierta al SW
                                                               → showNotification()
```

Tres piezas:

1. **PWA instalable** (manifest + service worker). Requisito para push en iOS;
   opcional en Chrome/Android/desktop.
2. **Suscripción**: el navegador genera un `PushSubscription` (un endpoint único
   + dos claves de cifrado). Se manda a tu API y se guarda.
3. **Envío**: tu API usa la librería `web-push` para firmar un mensaje con las
   claves VAPID y postearlo al endpoint. El push service lo entrega y despierta
   al service worker, que muestra la notificación.

**No hace falta** cuenta en FCM ni en APNs. VAPID (Voluntary Application Server
Identification) reemplaza todo eso: generás un par de claves una sola vez y con
eso te autenticás ante cualquier push service.

---

## 2. Prerequisito: claves VAPID

Un solo par para toda la app, generado una vez:

```bash
npx web-push generate-vapid-keys
# Public Key:  BEl62iUYgUiv...   (va al front Y al back)
# Private Key: gqvHQBxfmutn...   (SÓLO al back, es secreto)
```

Variables de entorno:

| Dónde | Variable | Valor |
|---|---|---|
| Backend | `VAPID_PUBLIC_KEY` | la pública |
| Backend | `VAPID_PRIVATE_KEY` | la privada (secreta) |
| Frontend (build-time) | `VITE_VAPID_PUBLIC_KEY` | la **misma** pública |

> La pública **tiene** que viajar al navegador (la necesita para suscribirse).
> No es un secreto, no pasa nada si queda en el bundle. La privada nunca sale
> del backend.

---

## 3. Frontend

### 3.1 Manifest + service worker (`vite-plugin-pwa`)

```bash
npm i -D vite-plugin-pwa
```

`vite.config.ts`:

```ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',      // ⬅ NO 'generateSW': necesitás código propio en el SW
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,             // el registro lo hacés a mano, ver 3.2
      registerType: 'autoUpdate',
      devOptions: { enabled: false },    // el SW sólo se prueba contra el build real
      manifest: {
        name: 'Mi App',
        short_name: 'App',
        theme_color: '#16513C',
        background_color: '#F6F2EA',
        display: 'standalone',           // ⬅ obligatorio para que iOS la trate como app
        start_url: '/',
        lang: 'es-AR',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
```

**`injectManifest` vs `generateSW`**: `generateSW` te arma un service worker
automático de cacheo y listo — pero no podés meterle listeners de `push` /
`notificationclick`. Con `injectManifest` escribís vos el archivo del SW y el
plugin sólo le inyecta la lista de precache.

**Íconos**: hacen falta 192, 512 y una versión `maskable` (Android recorta el
ícono en un círculo; sin la versión pensada para eso, el logo queda cortado).
En iOS agregá además en el `<head>`:

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="App" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

(iOS **no lee el manifest** para el título ni el ícono de la pantalla de inicio;
sin estas líneas la PWA instalada abre igual con la barra de Safari.)

### 3.2 El service worker (`src/sw.ts`)

```ts
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// Precache mínimo (para que el navegador la considere instalable). SIN estrategia
// de cache offline agresiva — una cache agresiva genera bugs de "versión vieja
// pegada" en un proyecto que se deploya seguido.
precacheAndRoute(self.__WB_MANIFEST);

self.skipWaiting();
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// --- PUSH ---
interface PushPayload { title: string; body: string; url?: string }

self.addEventListener('push', (event) => {
  let data: PushPayload = { title: 'Mi App', body: 'Tenés novedades.' };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // payload no-JSON: mostrar algo genérico es mejor que nada
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url ?? '/' },
    }),
  );
});

// --- CLICK EN LA NOTIFICACIÓN ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
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
```

**Gotcha de TypeScript**: `self` en un service worker es
`ServiceWorkerGlobalScope`, no `Window`. Mezclar la lib `DOM` y `WebWorker` en el
mismo `tsconfig` rompe. Solución: sacá `sw.ts` del `tsconfig` principal
(`"exclude": ["src/sw.ts"]`) y hacele uno aparte:

```jsonc
// tsconfig.sw.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "WebWorker"],
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/sw.ts"]
}
```

Y en el script de typecheck: `tsc --noEmit && tsc --noEmit -p tsconfig.sw.json`.

### 3.3 Registro del service worker

Con `injectRegister: false`, lo registrás a mano en el entrypoint (`main.tsx`):

```ts
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });
```

(Necesitás `/// <reference types="vite-plugin-pwa/client" />` en tu `vite-env.d.ts`
para que TS conozca el módulo virtual.)

### 3.4 Detección de plataforma

```ts
export function isIOS(): boolean {
  // iPadOS 13+ se identifica como Mac con touch — sin el chequeo de
  // maxTouchPoints un iPad queda mal clasificado como desktop.
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
```

**La regla clave de iOS**: en Safari/iOS el push **sólo funciona si la PWA está
instalada** (Agregada a la pantalla de inicio) **y** el iOS es 16.4+. Fuera de
iOS (Chrome/Android/desktop) el push anda sin instalar nada. Entonces:

- `isIOS() && !isStandalone()` → mostrar instrucciones de "Agregá a inicio",
  el toggle de notificaciones **no puede funcionar** todavía.
- cualquier otra plataforma → el toggle de notificaciones aparece directo.
  Ofrecer "Instalar app" como comodidad aparte, **nunca como requisito**.

### 3.5 El prompt de instalación (`beforeinstallprompt`)

Chrome/Android/desktop disparan un evento `beforeinstallprompt` **una sola vez
por carga de página**. Hay que capturarlo apenas llega o se pierde:

```ts
let deferredPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();                 // si no, Chrome muestra su propio mini-banner
  deferredPrompt = e as BeforeInstallPromptEvent;
});
window.addEventListener('appinstalled', () => { deferredPrompt = null; });

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  deferredPrompt = null;              // se consume una sola vez
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome;
}
```

**iOS no tiene este evento.** Instalar en iOS es manual: Compartir → "Agregar a
inicio". No hay forma de dispararlo por código.

### 3.6 Suscribirse

```ts
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function subscribeToPush(accessToken: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;

  // OJO: requestPermission() necesita un GESTO REAL del usuario (un click).
  // Llamarlo desde código suelto lo ignora en silencio y devuelve 'default'.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('PERMISSION_DENIED');

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,   // obligatorio: te comprometés a mostrar SIEMPRE una notificación visible
    applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
  });

  const json = subscription.toJSON();   // { endpoint, keys: { p256dh, auth } }
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
}

export async function unsubscribeFromPush(accessToken: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ endpoint }),
  });
}
```

### 3.7 Estado de la UI

La fuente de verdad de "¿estoy suscripto en ESTE navegador?" es el navegador
mismo (`pushManager.getSubscription()`), **no un flag en tu backend** — una
suscripción es por dispositivo/navegador, no por cuenta.

```ts
export type PushUiState = 'unsupported' | 'ios-not-installed' | 'not-subscribed' | 'subscribed' | 'denied';

export async function getPushUiState(): Promise<PushUiState> {
  if (!isPushSupported()) return 'unsupported';
  if (isIOS() && !isStandalone()) return 'ios-not-installed';
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'subscribed' : 'not-subscribed';
}
```

`denied` es terminal: una vez que el usuario bloqueó el permiso, **no hay forma
de volver a pedirlo por código** (spec de la Push API, para frenar sitios que
insisten). Sólo se reactiva a mano desde los ajustes del navegador.

---

## 4. Backend

### 4.1 Esquema de base de datos

```sql
-- Suscripciones. Una por dispositivo/navegador; un usuario puede tener varias.
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,          -- identifica el par navegador+dispositivo
  p256dh     text not null,                 -- claves públicas de cifrado que
  auth       text not null,                 -- devuelve pushManager.subscribe()
  created_at timestamptz not null default now()
);
create index on push_subscriptions (user_id);

-- Preferencias por tipo de aviso (opcional pero recomendado si tenés más de
-- un tipo de notificación). Independiente de si tiene o no una suscripción.
alter table profiles add column notification_prefs jsonb not null
  default '{"pendingToday": true, "teammateActivity": false, "newMember": false}';

-- Log de idempotencia (para avisos disparados por cron, para no mandar dos
-- veces si el cron se ejecuta más de una vez).
create table notification_log (
  user_id     uuid not null references profiles(id) on delete cascade,
  ref_date    date not null,
  kind        text not null,        -- deja lugar a varios tipos sin migrar de nuevo
  sent_at     timestamptz not null default now(),
  primary key (user_id, ref_date, kind)
);
```

### 4.2 Endpoints de suscripción

```ts
// POST /push/subscribe  — registra la suscripción del navegador actual
router.post('/push/subscribe', async (req, res) => {
  const { endpoint, keys } = subscribeSchema.parse(req.body);  // zod: endpoint url, keys.p256dh/auth strings
  await db.query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
     values ($1, $2, $3, $4)
     on conflict (endpoint) do update set
       user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [req.user.id, endpoint, keys.p256dh, keys.auth],
  );
  res.status(201).json({ ok: true });
});

// DELETE /push/subscribe  — da de baja UNA suscripción (la de este navegador)
router.delete('/push/subscribe', async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
  await db.query(`delete from push_subscriptions where user_id = $1 and endpoint = $2`, [req.user.id, endpoint]);
  res.json({ ok: true });
});
```

El `on conflict (endpoint) do update` cubre el caso de que el mismo navegador se
vuelva a suscribir (permiso revocado y re-otorgado, reintento del registro).

### 4.3 Configurar `web-push` y mandar

```bash
npm i web-push
```

```ts
import webpush from 'web-push';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn('[push] faltan las claves VAPID — no se van a poder mandar avisos');
    return;
  }

  // ⚠️ EL SUBJECT DEL JWT DE VAPID — ver gotcha #3 abajo.
  // FCM (Chrome/Android) acepta casi cualquier cosa; Apple (Safari/iOS)
  // RECHAZA con 403 BadJwtToken un mailto: con dominio reservado (.example).
  // Usá una URL https real o un mailto real.
  const subject = process.env.VAPID_CONTACT_EMAIL ?? 'https://tu-app.com';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

interface SubRow { id: string; endpoint: string; p256dh: string; auth: string }

export async function sendToSubscription(
  sub: SubRow,
  payload: { title: string; body: string; url?: string },
): Promise<'sent' | 'gone' | 'error'> {
  ensureConfigured();
  if (!configured) return 'error';
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return 'sent';
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404 / 410 Gone = la suscripción ya no existe del otro lado (el usuario
    // desinstaló, borró datos del navegador). Se borra sola.
    if (status === 404 || status === 410) {
      await db.query(`delete from push_subscriptions where id = $1`, [sub.id]);
      return 'gone';
    }
    // 403, 400, 5xx: NO se borra — puede ser un problema de config del server
    // (subject mal, claves cambiadas), no de la suscripción.
    console.error('[push] error mandando', status, err);
    return 'error';
  }
}

export async function subscriptionsForUser(userId: string): Promise<SubRow[]> {
  const r = await db.query(
    `select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1`,
    [userId],
  );
  return r.rows;
}
```

### 4.4 Disparadores

Hay dos patrones según el tipo de aviso.

#### A) Avisos programados (ej. "te falta cargar algo hoy") → cron

Si tu infra no tiene cron nativo (planes free de Render, etc.), un endpoint
protegido por secreto que un cron externo (cron-job.org) golpea una vez al día:

```ts
router.post('/internal/cron/notify-pending', async (req, res) => {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const targets = await findUsersToNotify();   // tu lógica de negocio

  for (const user of targets) {
    // Idempotencia: insert ... on conflict do nothing. Si ya se mandó hoy,
    // el insert no devuelve fila y se saltea. Mejor que un select previo:
    // evita una carrera si el cron se dispara dos veces casi al mismo tiempo.
    const logged = await db.query(
      `insert into notification_log (user_id, ref_date, kind)
       values ($1, current_date, 'pending')
       on conflict do nothing returning user_id`,
      [user.id],
    );
    if (logged.rows.length === 0) continue;

    // Filtrar por preferencia + tener suscripción
    if (!user.notification_prefs.pendingToday) continue;
    const subs = await subscriptionsForUser(user.id);
    for (const sub of subs) await sendToSubscription(sub, buildPayload(user));
  }

  res.json({ ok: true });
});
```

#### B) Avisos por evento (ej. "un compañero cargó su tiempo") → fire-and-forget

Se disparan **en el momento**, desde el mismo código que ya procesa la acción.
Regla de oro: **no bloquear la respuesta** de la acción que los originó. Se
llaman sin `await`, con el error swalloweado adentro:

```ts
// Dentro del handler que guarda el resultado, DESPUÉS de responder / commitear:
if (!isDnf && wasCreated) {   // sólo la primera carga, nunca una edición ni un DNF
  void notifyTeammates({ groupId, actorId, gameName, seconds, isPersonalBest });
}
```

```ts
export async function notifyTeammates(params: {
  groupId: string; actorId: string; gameName: string; seconds: number; isPersonalBest: boolean;
}): Promise<void> {
  try {
    const actor = await db.query(`select display_name from profiles where id = $1`, [params.actorId]);
    const actorName = actor.rows[0]?.display_name ?? 'Alguien';

    // Filtra por preferencia ANTES de buscar suscripciones.
    const teammates = await db.query(
      `select gm.user_id from group_members gm
         join profiles p on p.id = gm.user_id
        where gm.group_id = $1 and gm.user_id != $2
          and coalesce((p.notification_prefs->>'teammateActivity')::boolean, false)`,
      [params.groupId, params.actorId],
    );

    const payload = params.isPersonalBest
      ? { title: '🏆 Nuevo récord', body: `${actorName} hizo ${fmt(params.seconds)} en ${params.gameName}.`, url: '/hoy' }
      : { title: 'Mi App', body: `${actorName} completó ${params.gameName} en ${fmt(params.seconds)}.`, url: '/hoy' };

    for (const row of teammates.rows) {
      for (const sub of await subscriptionsForUser(row.user_id)) {
        await sendToSubscription(sub, payload);
      }
    }
  } catch (err) {
    // NUNCA debe tumbar la acción que lo disparó — sólo loguear.
    console.error('[push] error en aviso de actividad', err);
  }
}
```

**¿Por qué fire-and-forget y no `await`?** Con hasta N destinatarios, cada uno
una llamada HTTP al push service (~100-300ms), esperarlos a todos antes de
responder le agregaría segundos a una acción que hoy es instantánea. Y si un
push falla, no es crítico: la acción principal (guardar el tiempo) ya se
completó.

**Nunca lo metas dentro de una transacción de base de datos.** Usá el pool
top-level, no la conexión transaccional del handler. Es un efecto secundario que
no debe poder hacer rollback de nada ni demorar el `COMMIT`.

---

## 5. Gotchas (los que nos costaron tiempo)

### #1 — `Notification.requestPermission()` necesita un gesto real

Llamado desde código suelto (un `useEffect`, un `setTimeout`) devuelve `'default'`
sin mostrar nada. **Tiene que estar en el handler de un click real del usuario.**
Los clicks sintéticos de automatización de browser tampoco cuentan — esto sólo
se prueba a mano.

### #2 — iOS necesita la PWA instalada, y sólo iOS

- Chrome/Android/desktop: el push anda sin instalar nada.
- iOS/iPadOS: **sólo** si está Agregada a la pantalla de inicio y el iOS es
  16.4+. `pushManager.subscribe()` directamente tira error fuera de modo
  standalone en Safari.
- No caigas en la trampa de esconder el toggle de notificaciones detrás de un
  "Instalar app" obligatorio en todas las plataformas — en desktop es un paso
  de más que confunde.

### #3 — Apple rechaza el `sub` del JWT de VAPID con dominios reservados

**Este fue el que nos comió una tarde.** El subject de VAPID (`setVapidDetails`)
identifica al remitente. El estándar acepta `mailto:` o `https:`. Pero:

- **FCM (Chrome/Android)** acepta casi cualquier string.
- **Apple (Safari/iOS)** rechaza con **`403 BadJwtToken`** un `mailto:` cuyo
  dominio sea reservado, tipo `.example` (`mailto:no-reply@app.example`).

Síntoma: en Chrome llegan las notificaciones, en iPhone no llega nada y **no hay
error visible** (el 403 no está en la lista de "borrar la suscripción", con
razón). Usá una **URL https real** (`https://tu-app.com`) o un `mailto:` real.

### #4 — El 403 no se limpia solo (y está bien)

`sendToSubscription` borra la suscripción en 404/410 (Gone = ya no existe del
otro lado). **No** en 403 ni 4xx/5xx: esos suelen ser problemas de config del
servidor (subject mal, claves rotadas), no de la suscripción. Si los borraras,
un error de config te vaciaría la tabla.

### #5 — El service worker y la cache stale en iOS

iOS es lento para actualizar service workers. `registerType: 'autoUpdate'` +
`skipWaiting()` + `clients.claim()` ayudan, pero si el usuario instaló la PWA
con un bundle viejo (sin la `VITE_VAPID_PUBLIC_KEY`, por ejemplo), puede quedar
con una suscripción hecha con una clave que no matchea. Mantené la cache del SW
al mínimo — sólo lo necesario para instalabilidad, sin estrategia offline
agresiva.

### #6 — `self.__WB_MANIFEST` y el tsconfig del service worker

Ver 3.2: `sw.ts` necesita `lib: ["WebWorker"]`, que choca con `lib: ["DOM"]` del
resto. Archivo aparte, tsconfig aparte.

### #7 — Preferencias por tipo ≠ tener una suscripción

Si tenés más de un tipo de notificación, "tiene una suscripción push" ya no
alcanza para decidir a quién mandarle qué. Guardá las preferencias aparte
(`notification_prefs` jsonb) y filtrá por la preferencia **antes** de buscar
suscripciones. Default: el aviso principal en `true`, los secundarios en
`false` (opt-in real).

### #8 — Una suscripción es por dispositivo, no por cuenta

Un usuario en el celu + la notebook = dos filas en `push_subscriptions`. Cuando
mandás, iterás **todas** las suscripciones del usuario. Cuando el front pregunta
"¿estoy suscripto?", la respuesta es de ESE navegador
(`pushManager.getSubscription()`), no un flag global.

---

## 6. Cómo probarlo

- **Chrome desktop**: es lo más rápido para el ciclo de desarrollo. Andá a
  `chrome://settings/content/notifications` y confirmá que el sitio esté
  permitido. Las notificaciones aparecen como toast del SO.
- **iPhone real**: instalá la PWA (Compartir → Agregar a inicio), abrila desde
  el ícono, dale permiso. **Verificá también Ajustes del sistema → Notificaciones
  → tu PWA** — el permiso del navegador y el del SO son dos cosas distintas.
- **Mandar un push de prueba sin tocar la UI**: script que lee una fila real de
  `push_subscriptions` y llama a `webpush.sendNotification` directo. Sirve para
  aislar "¿el problema es el envío o el disparador?".
- Para tests unitarios, extraé la lógica pura (armar el texto del payload,
  consolidar destinatarios) a funciones sin IO y testeá eso. El envío en sí no
  se testea con mocks, se prueba contra un navegador real.

---

## 7. Checklist de implementación

- [ ] `npx web-push generate-vapid-keys`; cargar las 3 env vars.
- [ ] `vite-plugin-pwa` en modo `injectManifest`, manifest con `display: standalone`.
- [ ] Íconos 192 / 512 / maskable + meta tags de `apple-mobile-web-app-*`.
- [ ] `src/sw.ts` con listeners `push` y `notificationclick`; tsconfig aparte.
- [ ] `registerSW({ immediate: true })` en el entrypoint.
- [ ] Helpers de front: `isIOS`, `isStandalone`, `isPushSupported`, `subscribeToPush`, `unsubscribeFromPush`, `getPushUiState`.
- [ ] Captura de `beforeinstallprompt` apenas carga la página.
- [ ] UI: toggle de notificaciones directo salvo en iOS-sin-instalar; "Instalar app" como opción, no requisito.
- [ ] Tabla `push_subscriptions` (+ `notification_prefs` si hay varios tipos, + `notification_log` si hay cron).
- [ ] `POST` / `DELETE /push/subscribe`.
- [ ] `sendToSubscription` con `web-push` — **subject VAPID con URL https o mailto real**, limpieza en 404/410.
- [ ] Disparadores: cron con secreto + idempotencia, o fire-and-forget sin `await` y sin transacción.
- [ ] Probar en un iPhone real, revisando el permiso a nivel SO.
