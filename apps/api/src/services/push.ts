import webpush from 'web-push';
import type { Pool, PoolClient } from 'pg';

/**
 * T10.2/T10.6, specs/02-design.md §10.2/§10.4. `web-push` firma con VAPID y
 * manda a cualquier push service (FCM, Mozilla, Apple) sin código específico
 * por navegador — el mismo llamado sirve para Chrome, Firefox y Safari/iOS.
 */
let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env['VAPID_PUBLIC_KEY'];
  const privateKey = process.env['VAPID_PRIVATE_KEY'];
  if (!publicKey || !privateKey) {
    console.warn('[push] faltan VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY — no se van a poder mandar avisos');
    return;
  }
  // El "mailto" es obligatorio en el estándar VAPID (identifica al remitente
  // ante el push service si algo sale mal). Configurable por env var para no
  // hardcodear un mail personal en el código — si no se carga, un placeholder
  // markeado como tal alcanza igual (el estándar no valida que reciba nada).
  const contact = process.env['VAPID_CONTACT_EMAIL'] ?? 'mailto:no-reply@liga-de-juegos.example';
  webpush.setVapidDetails(contact.startsWith('mailto:') ? contact : `mailto:${contact}`, publicKey, privateKey);
  configured = true;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function upsertSubscription(
  client: Pool | PoolClient,
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
) {
  // Un endpoint es único globalmente (§3.1) — si el mismo navegador se vuelve a
  // suscribir (permiso revocado y vuelto a dar, o simplemente reintenta el
  // registro), esto actualiza la fila en vez de chocar contra la unique.
  await client.query(
    `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
     values ($1, $2, $3, $4)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth],
  );
}

export async function deleteSubscription(client: Pool | PoolClient, userId: string, endpoint: string) {
  await client.query(`delete from public.push_subscriptions where user_id = $1 and endpoint = $2`, [userId, endpoint]);
}

export async function subscriptionsForUser(client: Pool | PoolClient, userId: string): Promise<PushSubscriptionRow[]> {
  const r = await client.query(`select id, endpoint, p256dh, auth from public.push_subscriptions where user_id = $1`, [userId]);
  return r.rows;
}

/**
 * Manda el mensaje a UNA suscripción puntual. Si el push service devuelve
 * 404/410 (Gone), esa suscripción ya no existe del otro lado (desinstaló,
 * borró datos del navegador) — se borra sola, si no la tabla crece con
 * basura que nunca más se puede volver a usar (§10.4).
 */
export async function sendToSubscription(
  client: Pool | PoolClient,
  sub: PushSubscriptionRow,
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
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await client.query(`delete from public.push_subscriptions where id = $1`, [sub.id]);
      return 'gone';
    }
    console.error('[push] error mandando notificación', err);
    return 'error';
  }
}
