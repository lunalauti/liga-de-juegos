import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiClientError } from '../api/client';
import { useSession } from '../hooks/useSession';
import { LoadingState } from '../components/LoadingState';
import { getPushUiState, subscribeToPush, unsubscribeFromPush, isStandalone, type PushUiState } from '../lib/push';
import { promptInstall } from '../lib/installPrompt';
import { InstallTutorial } from '../components/InstallTutorial';

interface Me {
  id: string;
  displayName: string;
  avatar: string | null;
  groups: { id: string; name: string; inviteCode: string; role: string }[];
}

/** RF-2 — editar nombre visible y avatar. */
export default function Perfil() {
  const { session, signOut } = useSession();
  const token = session?.access_token;
  const navigate = useNavigate();

  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch<Me>('/me', { accessToken: token })
      .then((data) => {
        setMe(data);
        setDisplayName(data.displayName);
        setAvatar(data.avatar ?? '');
      })
      .catch((e) => setError(e instanceof ApiClientError ? e.message : 'No pudimos cargar tu perfil'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<Me>('/me', {
        method: 'PATCH',
        accessToken: token,
        body: { displayName: displayName.trim(), avatar: avatar.trim() || undefined },
      });
      setMe((prev) => (prev ? { ...prev, ...updated } : prev));
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No pudimos guardar los cambios');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Shell><LoadingState /></Shell>;

  return (
    <Shell>
      <button
        type="button"
        aria-label="Volver"
        onClick={() => navigate('/')}
        style={{ background: 'transparent', border: 'none', fontSize: 20, color: '#4A4438', cursor: 'pointer', padding: 0, marginBottom: 12 }}
      >
        ←
      </button>
      <h1 className="lj-display" style={{ fontSize: 40, margin: '0 0 24px' }}>Tu perfil</h1>

      <form onSubmit={handleSubmit} className="lj-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label htmlFor="displayName" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Nombre visible</span>
          <input
            id="displayName"
            className="form-control"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            minLength={2}
            maxLength={30}
            required
          />
        </label>

        <label htmlFor="avatar" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Avatar (emoji)</span>
          <input
            id="avatar"
            className="form-control"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="🦊"
            maxLength={8}
          />
        </label>

        {error && <p role="alert" style={{ color: '#A8352A', fontSize: 13, margin: 0 }}>{error}</p>}
        {saved && <p role="status" style={{ color: '#16513C', fontSize: 13, margin: 0 }}>Guardado.</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      <NotificationsCard token={token} />
      {!isStandalone() && <InstallTutorial />}

      {me && me.groups.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2 className="lj-card-title" style={{ fontSize: 18, margin: '0 0 10px' }}>Tus grupos</h2>
          <div className="lj-card">
            {me.groups.map((g, i) => (
              <div
                key={g.id}
                style={{ padding: '10px 14px', borderBottom: i < me.groups.length - 1 ? '1px solid #EDE7DA' : 'none', display: 'flex', justifyContent: 'space-between' }}
              >
                <span style={{ fontWeight: 600 }}>{g.name}</span>
                <span className="lj-label">{g.role === 'admin' ? 'admin' : ''}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        className="btn btn-outline-dark"
        onClick={() => void signOut()}
        style={{ marginTop: 24, width: '100%' }}
      >
        Cerrar sesión
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 420, margin: '0 auto', padding: '40px 20px' }}>{children}</div>;
}

/**
 * T10.4, specs/02-design.md §10.3 — RF-21/RF-22. Seis estados posibles según
 * plataforma y permiso; ninguno es "el flujo", cada uno es un estado final
 * válido por sí mismo (§10.3 lo deja explícito). El estado se recalcula, nunca
 * se guarda en un flag propio: la fuente de verdad de "¿estoy suscripto en
 * ESTE navegador?" es el navegador mismo (`pushManager.getSubscription()`).
 */
function NotificationsCard({ token }: { token: string | undefined }) {
  const [state, setState] = useState<PushUiState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    getPushUiState()
      .then(setState)
      .catch(() => setState('unsupported'));
  };

  useEffect(refresh, []);

  if (state === 'loading') return null;
  if (state === 'unsupported') return null; // RNF-9: no aparece nada, no un error

  async function handleInstall() {
    setError(null);
    const outcome = await promptInstall();
    if (outcome === 'accepted') refresh();
  }

  async function handleToggle(next: boolean) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      if (next) {
        await subscribeToPush(token);
      } else {
        await unsubscribeFromPush(token);
      }
      refresh();
    } catch (e) {
      if (e instanceof Error && e.message === 'PERMISSION_DENIED') {
        setError('No diste el permiso — no se puede activar sin eso.');
      } else {
        setError('No pudimos activar los avisos. Probá de nuevo en un rato.');
      }
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginTop: 28 }}>
      <h2 className="lj-card-title" style={{ fontSize: 18, margin: '0 0 10px' }}>Avisos</h2>
      <div className="lj-card" style={{ padding: 16 }}>
        {state === 'ios-not-installed' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>Agregá esto a tu pantalla de inicio para poder recibir avisos</p>
            <p style={{ fontSize: 13, color: '#4A4438', lineHeight: 1.7, margin: 0 }}>
              En iPhone, los avisos sólo funcionan si la app está instalada (es una limitación de Apple, no nuestra):
            </p>
            <ol style={{ fontSize: 13, color: '#4A4438', lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
              <li>Tocá el ícono de Compartir en Safari (el cuadradito con la flecha).</li>
              <li>Elegí "Agregar a inicio".</li>
              <li>Abrí Liga de Juegos desde el ícono nuevo, y volvé acá.</li>
            </ol>
          </div>
        )}

        {state === 'installable' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 13, color: '#4A4438', margin: 0 }}>Instalá la app para recibir avisos y acceso más rápido.</p>
            <button type="button" className="btn btn-primary" onClick={() => void handleInstall()}>Instalar app</button>
          </div>
        )}

        {(state === 'not-subscribed' || state === 'subscribed') && (
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: busy ? 'default' : 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Avisarme si me faltan tiempos</span>
              <span style={{ fontSize: 12, color: '#6B6357' }}>Un aviso por día, a la noche, si te queda algo pendiente.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="form-check-input"
              checked={state === 'subscribed'}
              disabled={busy}
              onChange={(e) => void handleToggle(e.target.checked)}
              style={{ flex: '0 0 auto' }}
            />
          </label>
        )}

        {state === 'denied' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#8C8271' }}>Avisarme si me faltan tiempos</span>
              <span style={{ fontSize: 12, color: '#6B6357' }}>Lo bloqueaste desde el navegador — hay que habilitarlo ahí para poder activarlo acá.</span>
            </span>
            <input type="checkbox" role="switch" className="form-check-input" checked={false} disabled style={{ flex: '0 0 auto' }} />
          </div>
        )}

        {error && <p role="alert" style={{ color: '#A8352A', fontSize: 12, margin: '10px 0 0' }}>{error}</p>}
      </div>
    </section>
  );
}
