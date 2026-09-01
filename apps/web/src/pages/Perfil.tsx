import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch, ApiClientError } from '../api/client';
import { useSession } from '../hooks/useSession';

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

  if (loading) return <Shell><p style={{ color: '#6B6357' }}>Cargando tu perfil…</p></Shell>;

  return (
    <Shell>
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
