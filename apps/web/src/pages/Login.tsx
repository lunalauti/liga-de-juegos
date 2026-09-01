import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useSession } from '../hooks/useSession';

type Mode = 'signin' | 'signup';

/**
 * RF-1: registro e inicio de sesión, con Google y con email+contraseña, sesión
 * persistente. No hay artboard para esta pantalla (no está en los 7 del canvas);
 * se construyó con los mismos tokens del sistema (design/tokens.md).
 */
export default function Login() {
  const { session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (session) {
    navigate(from, { replace: true });
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (displayName.trim().length < 2) {
          setError('Contanos cómo te llamamos en la tabla (al menos 2 letras).');
          return;
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName.trim() } },
        });
        if (signUpError) {
          setError(readableError(signUpError.message));
          return;
        }
        // Supabase devuelve un usuario con identities vacío cuando el email ya existe.
        if (data.user && data.user.identities?.length === 0) {
          setError('Ya existe una cuenta con ese email. Iniciá sesión.');
          return;
        }
        if (!data.session) {
          setNotice('Te mandamos un mail para confirmar la cuenta. Revisá la bandeja de entrada.');
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError('Email o contraseña incorrectos.');
          return;
        }
      }
      navigate(from, { replace: true });
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  return (
    <div style={{ maxWidth: 380, margin: '0 auto', padding: '56px 20px' }}>
      <p className="lj-label" style={{ marginBottom: 8 }}>Liga de Juegos</p>
      <h1 className="lj-display" style={{ fontSize: 40, margin: '0 0 28px' }}>
        {mode === 'signin' ? 'Entrá a la tabla' : 'Sumate a la liga'}
      </h1>

      <div className="lj-card" style={{ padding: 20 }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
          {mode === 'signup' && (
            <Field label="Nombre visible" htmlFor="displayName">
              <input
                id="displayName"
                className="form-control"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Como te van a ver en la tabla"
                autoComplete="nickname"
                required
                minLength={2}
                maxLength={30}
              />
            </Field>
          )}

          <Field label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </Field>

          <Field label="Contraseña" htmlFor="password">
            <input
              id="password"
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </Field>

          {error && <p role="alert" style={{ color: '#A8352A', fontSize: 13, margin: 0 }}>{error}</p>}
          {notice && <p role="status" style={{ color: '#16513C', fontSize: 13, margin: 0 }}>{notice}</p>}

          <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Un segundo…' : mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
          <span style={{ flex: 1, height: 1, background: '#DDD6C8' }} />
          <span className="lj-label" style={{ fontSize: 9 }}>o</span>
          <span style={{ flex: 1, height: 1, background: '#DDD6C8' }} />
        </div>

        <button type="button" className="btn btn-outline-dark" onClick={handleGoogle} style={{ width: '100%' }}>
          Continuar con Google
        </button>
      </div>

      <p style={{ fontSize: 13, color: '#6B6357', marginTop: 16, textAlign: 'center' }}>
        {mode === 'signin' ? 'Todavía no tenés cuenta acá' : '¿Ya jugás en algún grupo?'}{' '}
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
            setNotice(null);
          }}
          style={{ background: 'none', border: 0, padding: 0, color: '#16513C', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
        >
          {mode === 'signin' ? 'Creá una cuenta' : 'Iniciá sesión'}
        </button>
      </p>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function readableError(message: string): string {
  if (/already registered|already exists/i.test(message)) {
    return 'Ya existe una cuenta con ese email. Iniciá sesión.';
  }
  if (/password/i.test(message) && /least|short|6/i.test(message)) {
    return 'La contraseña necesita al menos 6 caracteres.';
  }
  return 'No pudimos crear la cuenta. Revisá los datos e intentá de nuevo.';
}
