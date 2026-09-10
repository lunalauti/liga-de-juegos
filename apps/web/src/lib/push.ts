import { apiFetch } from '../api/client';
import { getInstallPrompt } from './installPrompt';

/**
 * T10.2/T10.3/T10.4, specs/02-design.md §10.2/§10.3. Toda la lógica de
 * plataforma + suscripción push, separada de la UI (Perfil.tsx sólo
 * renderiza según el estado que esto devuelve) — mismo criterio que
 * `scoring/*.ts` en la API: la parte que hay que razonar con cuidado vive
 * aparte de lo que sólo pinta.
 */
export type PushUiState = 'unsupported' | 'ios-not-installed' | 'not-subscribed' | 'subscribed' | 'denied';

export function isIOS(): boolean {
  // iPadOS 13+ se identifica como Mac con soporte táctil — sin el chequeo de
  // maxTouchPoints, un iPad queda mal clasificado como "desktop".
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Clave del manifest en base64url → Uint8Array, formato que pide `applicationServerKey`. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Safe);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function getPushUiState(): Promise<PushUiState> {
  if (!isPushSupported()) return 'unsupported';
  // Instalar sólo es un requisito TÉCNICO en iOS (Apple no deja usar Web Push
  // desde Safari si no está agregada a la pantalla de inicio). En
  // Chrome/Android/desktop las notificaciones andan igual sin instalar nada
  // — instalar ahí es sólo una comodidad aparte (ver `canInstall`), nunca un
  // paso obligatorio antes de poder activar los avisos.
  if (isIOS() && !isStandalone()) return 'ios-not-installed';
  if (Notification.permission === 'denied') return 'denied';

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'subscribed' : 'not-subscribed';
}

/** Sólo informativo: hay un prompt de instalación nativo disponible (Chrome/Android/desktop) y todavía no está instalada. No condiciona si se puede activar el toggle de avisos. */
export function canInstall(): boolean {
  return !isStandalone() && !!getInstallPrompt();
}

export async function subscribeToPush(accessToken: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('PERMISSION_DENIED');

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
  });
  const json = subscription.toJSON();
  await apiFetch('/push/subscribe', {
    method: 'POST',
    accessToken,
    body: { endpoint: json.endpoint, keys: json.keys },
  });
}

export async function unsubscribeFromPush(accessToken: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await apiFetch('/push/subscribe', { method: 'DELETE', accessToken, body: { endpoint } });
}
