import { isIOS } from '../lib/push';

/**
 * Pedido del usuario, 2026-09-09 — minitutorial ilustrado de cómo instalar la
 * app (RF-21), distinto según la plataforma: en iOS no existe un botón nativo
 * de instalar (§10.1), hay que ir por Compartir → Agregar a inicio; en
 * Chrome/Android/desktop sí hay botón propio, servido desde Perfil.
 * El caller decide si tiene sentido mostrarlo (no tiene sentido si ya está instalada).
 */
export function InstallTutorial() {
  const ios = isIOS();
  return (
    <section style={{ marginTop: 28 }}>
      <h2 className="lj-card-title" style={{ fontSize: 18, margin: '0 0 10px' }}>Cómo instalar la app</h2>
      <div className="lj-card" style={{ padding: 16 }}>
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
      </div>
    </section>
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
