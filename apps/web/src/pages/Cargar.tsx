import { useRef, useState } from 'react';
import { formatTime, todayInArgentina, GAMES } from '@liga/shared';
import { apiFetch, ApiClientError } from '../api/client';
import { useSession } from '../hooks/useSession';
import { useMe } from '../hooks/useMe';
import { GameCard, Chip } from '../components/ui';

/**
 * Artboard 02 · "Cargar tiempos": el link primero, la carga a mano plegada abajo.
 * Ver specs/02-design.md §6.2, §6.5 y §9.4. El preview es de sólo lectura
 * (`/entries/import/preview`); nada se guarda hasta tocar "Confirmar"
 * (`/entries/import`) — importante: Descartar tiene que dejar la base como estaba.
 */
export default function Cargar() {
  const { session } = useSession();
  const token = session?.access_token;
  const { me } = useMe();
  const groupIds = me?.groups.map((g) => g.id) ?? [];

  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<ImportErrorState | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTyping(pasted: string) {
    setUrl(pasted);
    setPreview(null);
    setImportError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!pasted.trim() || !token || groupIds.length === 0) return;
    // Debounce: no le pegamos a la API en cada tecla, sólo cuando el usuario paró.
    debounceRef.current = setTimeout(() => void runPreview(pasted), 300);
  }

  async function runPreview(pasted: string) {
    if (!token) return;
    setChecking(true);
    try {
      const result = await apiFetch<ImportResponse>('/entries/import/preview', {
        method: 'POST',
        accessToken: token,
        body: { groupIds, url: pasted },
      });
      setPreview(toPreview(result));
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'LINK_ALREADY_USED') {
        setImportError({ message: e.message, importedBy: String(e.details['importedBy'] ?? '') });
      } else if (e instanceof ApiClientError) {
        setImportError({ message: e.message });
      } else {
        setImportError({ message: 'No pudimos leer ese link. Probá de nuevo.' });
      }
    } finally {
      setChecking(false);
    }
  }

  async function handleConfirm() {
    if (!token || !url.trim()) return;
    setConfirming(true);
    try {
      await apiFetch<ImportResponse>('/entries/import', {
        method: 'POST',
        accessToken: token,
        body: { groupIds, url },
      });
      setConfirmed(true);
    } catch (e) {
      setImportError({ message: e instanceof ApiClientError ? e.message : 'No pudimos guardarlo. Probá de nuevo.' });
      setPreview(null);
    } finally {
      setConfirming(false);
    }
  }

  function reset() {
    setUrl('');
    setPreview(null);
    setImportError(null);
    setConfirmed(false);
  }

  if (confirmed && preview) {
    return (
      <Screen>
        <Header dateLabel={formatShortDate(preview.puzzleDate)} />
        <div className="lj-card" style={{ padding: 16, textAlign: 'center' }}>
          <Chip kind="verified">GUARDADO</Chip>
          <p style={{ marginTop: 10, fontSize: 14, color: '#4A4438' }}>
            {preview.gameName} cargado. Ya está en la tabla.
          </p>
          <button type="button" className="btn btn-outline-dark" style={{ marginTop: 12 }} onClick={reset}>
            Cargar otro link
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header dateLabel={formatShortDate(todayInArgentina())} />

      {!preview && (
        <div style={{ background: '#fff', border: '1.5px solid #16513C', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="lj-label">Camino rápido</span>
          <span className="lj-card-title" style={{ fontSize: 22 }}>Pegá el link de tu resultado</span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: `1px solid ${importError ? '#A8352A' : '#DDD6C8'}`,
              background: importError ? '#FCF2F0' : '#FBF8F1',
              padding: 12,
            }}
          >
            <input
              aria-label="Link del resultado"
              className="lj-t"
              style={{ flex: 1, border: 0, background: 'transparent', fontSize: 16, outline: 'none', minWidth: 0 }}
              value={url}
              onChange={(e) => handleTyping(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (text) setTimeout(() => handleTyping(text), 0);
              }}
              placeholder="lanacion.agilmenteapp.com/shared/…"
            />
            {checking && <span style={{ fontSize: 11, color: '#6B6357' }}>revisando…</span>}
          </div>

          {importError && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: '#A8352A' }}>
              <span style={{ width: 16, height: 16, border: '1.5px solid #A8352A', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: '0 0 16px' }}>
                !
              </span>
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                {importError.importedBy ? `Ese link ya lo cargó ${importError.importedBy}. Buen intento.` : importError.message}
              </span>
            </div>
          )}
        </div>
      )}

      {preview && (
        <div style={{ background: '#fff', border: '1.5px solid #14120E' }}>
          <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid #DDD6C8' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="lj-label">Detectamos</span>
              <span className="lj-card-title" style={{ fontSize: 24 }}>{preview.gameName}</span>
              <span style={{ fontSize: 12, color: '#4A4438' }}>{formatLongDate(preview.puzzleDate)}</span>
            </div>
            {preview.verified && <Chip kind="verified">VERIFICADO</Chip>}
          </div>
          <div style={{ padding: 16, display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span className="lj-t" style={{ fontSize: 56, letterSpacing: '-0.045em' }}>
              {preview.dnf ? 'DNF' : formatTime(preview.durationSeconds)}
            </span>
          </div>
          <div style={{ padding: '0 16px 16px', display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-primary" style={{ flex: 1, height: 52 }} onClick={() => void handleConfirm()} disabled={confirming}>
              {confirming ? 'Guardando…' : 'Confirmar'}
            </button>
            <button type="button" className="btn" style={{ width: 96, height: 52, border: '1px solid #DDD6C8', color: '#4A4438' }} onClick={reset}>
              Descartar
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 'auto', borderTop: '1px solid #DDD6C8', paddingTop: 14 }}>
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 14,
            background: '#F1EBDD',
            border: '1px solid #DDD6C8',
            cursor: 'pointer',
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Cargar a mano</span>
            <span style={{ fontSize: 12, color: '#6B6357' }}>Sin link: los tres juegos de una</span>
          </span>
          <span aria-hidden="true">▾</span>
        </button>
        {manualOpen && groupIds[0] && <ManualEntryForm groupId={groupIds[0]} token={token} />}
      </div>
    </Screen>
  );
}

function ManualEntryForm({ groupId, token }: { groupId: string; token: string | undefined }) {
  const [values, setValues] = useState<Record<string, { dnf: boolean; time: string }>>(
    Object.fromEntries(GAMES.map((g) => [g.slug, { dnf: false, time: '' }])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const totalSeconds = GAMES.reduce((sum, g) => {
    const v = values[g.slug]!;
    if (v.dnf) return sum + g.penaltySeconds;
    // Sólo suma si parece un tiempo bien formado; si no, no rompe el total mientras se tipea.
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.time.trim());
    return m ? sum + Number(m[1]) * 60 + Number(m[2]) : sum;
  }, 0);

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const entries = GAMES.map((g) => {
        const v = values[g.slug]!;
        return v.dnf ? { gameSlug: g.slug, dnf: true } : { gameSlug: g.slug, time: v.time };
      });
      await apiFetch('/entries/bulk', {
        method: 'POST',
        accessToken: token,
        body: { groupIds: [groupId], puzzleDate: todayInArgentina(), entries },
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No pudimos guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 12, color: '#6B6357' }}>Lo que cargues a mano queda sin verificar.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {GAMES.map((g, i) => {
          const v = values[g.slug]!;
          return (
            <div key={g.slug} style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', top: -6, left: -4, fontSize: 10, color: '#6B6357' }}>{i + 1}</span>
              <GameCard
                label={g.shortName}
                value={v.dnf ? formatTime(g.penaltySeconds) : v.time || '--:--'}
                state={v.dnf ? 'dnf' : v.time ? 'focus' : 'empty'}
              />
              <input
                aria-label={`Tiempo de ${g.name}`}
                className="form-control"
                style={{ marginTop: 6, fontSize: 16 }}
                inputMode="numeric"
                placeholder="mm:ss"
                value={v.time}
                disabled={v.dnf}
                onChange={(e) => setValues((prev) => ({ ...prev, [g.slug]: { ...prev[g.slug]!, time: e.target.value } }))}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={v.dnf}
                  onChange={(e) => setValues((prev) => ({ ...prev, [g.slug]: { ...prev[g.slug]!, dnf: e.target.checked } }))}
                />
                No lo terminé
              </label>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: '#6B6357' }}>
        DNF: Crucigrama {formatTime(GAMES[0]!.penaltySeconds)} · Experto {formatTime(GAMES[1]!.penaltySeconds)} · Sudoku {formatTime(GAMES[2]!.penaltySeconds)}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Total del día</span>
        <span className="lj-t" style={{ fontSize: 20 }}>{formatTime(totalSeconds)}</span>
      </div>
      {error && <p role="alert" style={{ color: '#A8352A', fontSize: 13, margin: 0 }}>{error}</p>}
      {saved && <p role="status" style={{ color: '#16513C', fontSize: 13, margin: 0 }}>Guardado.</p>}
      <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar los tres'}
      </button>
    </div>
  );
}

interface ImportResponse {
  gameSlug: string;
  gameName: string;
  puzzleDate: string;
  lnSeconds: number;
  dnf: boolean;
  verified: boolean;
  groups: { groupId: string; entry?: { durationSeconds: number; gameId: string } }[];
}
interface ImportPreview {
  gameName: string;
  puzzleDate: string;
  durationSeconds: number;
  dnf: boolean;
  verified: boolean;
}
interface ImportErrorState {
  message: string;
  importedBy?: string;
}

function toPreview(r: ImportResponse): ImportPreview {
  const first = r.groups.find((g) => g.entry);
  return {
    gameName: r.gameName,
    puzzleDate: r.puzzleDate,
    durationSeconds: first?.entry?.durationSeconds ?? r.lnSeconds,
    dnf: r.dnf,
    verified: r.verified,
  };
}

function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

function formatLongDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '20px 20px 32px', minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {children}
    </div>
  );
}

function Header({ dateLabel }: { dateLabel: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h1 className="lj-card-title" style={{ fontSize: 22, margin: 0 }}>Cargar tiempos</h1>
      <span className="lj-label">{dateLabel} ▾</span>
    </div>
  );
}
