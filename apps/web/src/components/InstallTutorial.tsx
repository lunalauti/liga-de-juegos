import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import { isIOS, isStandalone, subscribeToPush } from '../lib/push';
import { promptInstall } from '../lib/installPrompt';

const MODAL_SEEN_KEY = 'liga:installTutorialSeen';

/** El contenido en sí — compartido entre la card de Perfil y el modal flotante de Home. */
function TutorialContent() {
  const ios = isIOS();
  return (
    <>
      <p style={{ fontSize: 12, color: '#6B6357', margin: '0 0 14px' }}>
        {ios ? 'En iPhone se instala a mano, en dos pasos:' : 'En Chrome/Android o en la compu, con un botón:'}
      </p>
      {ios ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TutorialStep icon={<ShareIcon />} label="Tocá Compartir" />
          <span aria-hidden="true" style={{ color: '#C9C0AC', fontSize: 18, flex: '0 0 auto' }}>→</span>
          <TutorialStep icon={<AddToHomeIcon />} label={'Elegí "Agregar a inicio"'} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TutorialStep icon={<ProfileIcon />} label="Andá a tu perfil" />
          <span aria-hidden="true" style={{ color: '#C9C0AC', fontSize: 18, flex: '0 0 auto' }}>→</span>
          <TutorialStep icon={<InstallButtonIcon />} label={'Tocá "Instalar app"'} />
        </div>
      )}
    </>
  );
}

/**
 * Pedido del usuario, 2026-09-09 — minitutorial ilustrado de cómo instalar la
 * app (RF-21), distinto según la plataforma: en iOS no existe un botón nativo
 * de instalar (§10.1), hay que ir por Compartir → Agregar a inicio; en
 * Chrome/Android/desktop sí hay botón propio, servido desde Perfil.
 * El caller decide si tiene sentido mostrarlo (no tiene sentido si ya está instalada).
 * Versión "card" para Perfil, siempre visible ahí (a diferencia del modal de
 * Home, esto no se descarta — es material de referencia, no una interrupción).
 */
export function InstallTutorial() {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 className="lj-card-title" style={{ fontSize: 18, margin: '0 0 10px' }}>Cómo instalar la app</h2>
      <div className="lj-card" style={{ padding: 16 }}>
        <TutorialContent />
      </div>
    </section>
  );
}

/**
 * Versión flotante para Home (pedido del usuario, 2026-09-09): tarjeta
 * centrada sobre un fondo oscurecido. Se acuerda en localStorage — cerrarla
 * una vez alcanza, no vuelve a insistir sola (mismo criterio que
 * NotifyPrompt). No aparece si ya está instalada.
 *
 * Tres CTA (pedido del usuario, 2026-09-10), de más a menos comprometida —
 * la más completa es la principal, "Cerrar" queda como salida discreta, no
 * compite visualmente con las acciones de verdad:
 *   1. "Activar avisos e instalar la app" — las dos cosas de una.
 *   2. "Sólo activar avisos" — sin instalar (RF-22 anda igual sin eso fuera de iOS).
 *   3. "Cerrar" — no hacer nada, no vuelve a preguntar.
 *
 * En iOS no hay ninguna de las dos acciones para ofrecer con un click: ni
 * instalar (no existe `beforeinstallprompt`, es Compartir → Agregar a inicio
 * a mano) ni suscribirse a push (Safari lo bloquea fuera de standalone) — ahí
 * el tutorial de arriba YA es la acción, sólo queda "Cerrar".
 */
export function InstallTutorialModal({ token }: { token: string | undefined }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ios = isIOS();

  useEffect(() => {
    if (!localStorage.getItem(MODAL_SEEN_KEY) && !isStandalone()) setVisible(true);
  }, []);

  if (!visible) return null;

  function close() {
    localStorage.setItem(MODAL_SEEN_KEY, '1');
    setVisible(false);
  }

  async function activate(alsoInstall: boolean) {
    if (!token) return close();
    setBusy(true);
    setError(null);
    try {
      await subscribeToPush(token);
      await apiFetch('/me/notification-prefs', { method: 'PATCH', accessToken: token, body: { pendingToday: true } });
      if (alsoInstall) await promptInstall();
      close();
    } catch (e) {
      setError(e instanceof Error && e.message === 'PERMISSION_DENIED' ? 'No diste el permiso — no se puede activar sin eso.' : 'No pudimos activar los avisos. Probá de nuevo en un rato.');
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cómo instalar la app"
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,14,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
      onClick={close}
    >
      <div
        className="lj-card"
        style={{ background: '#fff', maxWidth: 360, width: '100%', padding: 20, borderColor: '#14120E', borderWidth: 1.5 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="lj-card-title" style={{ fontSize: 20, margin: '0 0 4px' }}>Instalá la app</h2>
        <p style={{ fontSize: 12, color: '#6B6357', margin: '0 0 14px' }}>Acceso más rápido y avisos cuando te falten tiempos.</p>
        <TutorialContent />

        {error && <p role="alert" style={{ color: '#A8352A', fontSize: 12, margin: '14px 0 0' }}>{error}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
          {ios ? (
            <button type="button" className="btn btn-outline-dark" style={{ width: '100%' }} onClick={close}>
              Cerrar
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" style={{ width: '100%' }} disabled={busy} onClick={() => void activate(true)}>
                Activar avisos e instalar la app
              </button>
              <button type="button" className="btn btn-outline-dark" style={{ width: '100%' }} disabled={busy} onClick={() => void activate(false)}>
                Sólo activar avisos
              </button>
              <button type="button" className="btn btn-link" style={{ width: '100%', color: '#6B6357' }} disabled={busy} onClick={close}>
                Cerrar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TutorialStep({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <span style={{ fontSize: 12, color: '#4A4438', textAlign: 'center', lineHeight: 1.4 }}>{label}</span>
    </div>
  );
}

/** El ícono de "compartir" de iOS: un cajón con una flecha saliendo para arriba. */
function ShareIcon() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
      <rect x="14" y="26" width="36" height="30" rx="4" fill="none" stroke="#16513C" strokeWidth="3" />
      <g className="lj-tut-arrow">
        <line x1="32" y1="10" x2="32" y2="36" stroke="#16513C" strokeWidth="3" strokeLinecap="round" />
        <polyline points="22,20 32,10 42,20" fill="none" stroke="#16513C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** El ícono de "Agregar" de iOS: un + en un cuadrado redondeado. */
function AddToHomeIcon() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true" className="lj-tut-pop">
      <rect x="10" y="10" width="44" height="44" rx="11" fill="none" stroke="#16513C" strokeWidth="3" />
      <line x1="32" y1="21" x2="32" y2="43" stroke="#16513C" strokeWidth="3" strokeLinecap="round" />
      <line x1="21" y1="32" x2="43" y2="32" stroke="#16513C" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Chip de avatar (el mismo de Home/Stats) con un anillo de "tocá acá" pulsando. */
function ProfileIcon() {
  return (
    <svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
      <circle cx="32" cy="32" r="20" fill="none" stroke="#C9A227" strokeWidth="2" className="lj-tut-ring" />
      <rect x="20" y="20" width="24" height="24" fill="#fff" stroke="#14120E" strokeWidth="2" />
      <text x="32" y="36" fontSize="10" fontWeight="700" textAnchor="middle" fill="#14120E" fontFamily="'IBM Plex Mono', monospace">VC</text>
    </svg>
  );
}

/** Botón "Instalar app" con un anillo de toque pulsando encima. */
function InstallButtonIcon() {
  return (
    <svg viewBox="0 0 96 64" width="64" height="48" aria-hidden="true">
      <rect x="6" y="20" width="84" height="26" rx="3" fill="#16513C" />
      <text x="48" y="37" fontSize="9" fontWeight="600" textAnchor="middle" fill="#F6F2EA" fontFamily="Archivo, sans-serif">
        Instalar app
      </text>
      <circle cx="48" cy="33" r="7" fill="none" stroke="#C9A227" strokeWidth="2" className="lj-tut-ring" />
    </svg>
  );
}
