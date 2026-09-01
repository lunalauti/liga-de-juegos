import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiClientError } from '../api/client';
import { useSession } from '../hooks/useSession';

/** RF-4 — unirse a un grupo con el código de invitación. */
export default function GroupJoin() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const group = await apiFetch<{ id: string }>('/groups/join', {
        method: 'POST',
        accessToken: session.access_token,
        body: { code: code.trim() },
      });
      localStorage.setItem('liga:activeGroupId', group.id);
      navigate('/grupo', { replace: true });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No pudimos unirte al grupo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '48px 20px' }}>
      <p className="lj-label" style={{ marginBottom: 8 }}>Liga de Juegos</p>
      <h1 className="lj-display" style={{ fontSize: 36, margin: '0 0 20px' }}>Sumate a un grupo</h1>

      <form onSubmit={handleSubmit} className="lj-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label htmlFor="code" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Código de invitación</span>
          <input
            id="code"
            className="form-control lj-t"
            style={{ fontSize: 20, letterSpacing: '.06em', textTransform: 'uppercase' }}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="CRUCI-84"
            required
            autoFocus
          />
        </label>

        {error && <p role="alert" style={{ color: '#A8352A', fontSize: 13, margin: 0 }}>{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Uniéndote…' : 'Unirme'}
        </button>
      </form>
    </div>
  );
}
