import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiClientError } from '../api/client';
import { useSession } from '../hooks/useSession';

/** RF-3 — crear grupo. Sin artboard propio; usa los tokens del sistema. */
export default function GroupNew() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const group = await apiFetch<{ id: string; inviteCode: string }>('/groups', {
        method: 'POST',
        accessToken: session.access_token,
        body: { name: name.trim() },
      });
      localStorage.setItem('liga:activeGroupId', group.id);
      navigate('/grupo', { replace: true });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No pudimos crear el grupo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '48px 20px' }}>
      <p className="lj-label" style={{ marginBottom: 8 }}>Liga de Juegos</p>
      <h1 className="lj-display" style={{ fontSize: 36, margin: '0 0 20px' }}>Armá tu grupo</h1>

      <form onSubmit={handleSubmit} className="lj-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label htmlFor="groupName" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Nombre del grupo</span>
          <input
            id="groupName"
            className="form-control"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Los del crucigrama"
            minLength={2}
            maxLength={60}
            required
            autoFocus
          />
          <span style={{ fontSize: 12, color: '#6B6357' }}>
            Con esto armamos tu código de invitación, tipo CRUCI-84.
          </span>
        </label>

        {error && <p role="alert" style={{ color: '#A8352A', fontSize: 13, margin: 0 }}>{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creando…' : 'Crear grupo'}
        </button>
      </form>
    </div>
  );
}
