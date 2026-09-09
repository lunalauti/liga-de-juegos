import { useEffect, useRef, useState } from 'react';
import { formatTime, todayInArgentina, GAMES } from '@liga/shared';
import { apiFetch, ApiClientError } from '../api/client';
import { useSession } from '../hooks/useSession';
import { useMe } from '../hooks/useMe';
import { GameCard, Chip } from '../components/ui';
import { NoGroupState } from '../components/NoGroupState';
import { LoadingState } from '../components/LoadingState';

/**
 * Artboard 02 · "Cargar tiempos": el link primero, la carga a mano plegada abajo.
 * Ver specs/02-design.md §6.2, §6.5 y §9.4. El preview es de sólo lectura
 * (`/entries/import/preview`); nada se guarda hasta tocar "Confirmar"
 * (`/entries/import`) — importante: Descartar tiene que dejar la base como estaba.
 */
export default function Cargar() {
  const { session } = useSession();
  const token = session?.access_token;
  const { me, loading: loadingMe } = useMe();
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
      const result = await apiFetch<ImportResponse>('/entries/import', {
        method: 'POST',
        accessToken: token,
        body: { groupIds, url },
      });
      // El preview (dry-run) no sabe si es récord — recién se sabe al confirmar de verdad.
      setPreview((prev) => (prev ? { ...prev, isPersonalBest: result.isPersonalBest } : toPreview(result)));
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

  if (loadingMe) return <Screen><LoadingState /></Screen>;
  if (groupIds.length === 0) return <NoGroupState />;

  if (confirmed && preview) {
    return (
      <Screen>
        <Header dateLabel={formatShortDate(preview.puzzleDate)} />
        <div className="lj-card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Chip kind="verified">GUARDADO</Chip>
            {preview.isPersonalBest && <Chip kind="pb">Récord personal</Chip>}
          </div>
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
            <span style={{ fontSize: 12, color: '#6B6357' }}>Sin link: uno, dos o los tres juegos</span>
          </span>
          <span aria-hidden="true">▾</span>
        </button>
        {manualOpen && groupIds[0] && <ManualEntryForm groupId={groupIds[0]} token={token} />}
      </div>
    </Screen>
  );
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
interface GameValue { dnf: boolean; time: string; status: SaveStatus; error?: string; isPersonalBest?: boolean }

function hasInput(v: GameValue): boolean {
  return v.dnf || v.time.trim() !== '';
}

interface ActiveGame { slug: string; name: string; shortName: string; penaltySeconds: number }

function ManualEntryForm({ groupId, token }: { groupId: string; token: string | undefined }) {
  // Bug real reportado por el usuario (mismo que en Home, 2026-09-09): esto
  // mostraba los 3 juegos del catálogo estático sin importar cuáles el grupo
  // tiene realmente activos (RF-5, toggle en Ajustes) — el back ya rechazaba con
  // GAME_NOT_ACTIVE al guardar, pero mostraba la tarjeta igual, confuso. Ahora
  // pide el detalle real del grupo y sólo pinta los juegos con `enabled`.
  const [activeGames, setActiveGames] = useState<ActiveGame[] | null>(null);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch<{ games: { slug: string; name: string; penaltySeconds: number; enabled: boolean }[] }>(`/groups/${groupId}`, {
      accessToken: token,
    }).then((detail) => {
      if (cancelled) return;
      setActiveGames(
        detail.games
          .filter((g) => g.enabled)
          .map((g) => ({ slug: g.slug, name: g.name, shortName: GAMES.find((x) => x.slug === g.slug)?.shortName ?? g.name, penaltySeconds: g.penaltySeconds })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [groupId, token]);

  const [values, setValues] = useState<Record<string, GameValue>>({});
  useEffect(() => {
    if (!activeGames) return;
    setValues(Object.fromEntries(activeGames.map((g) => [g.slug, { dnf: false, time: '', status: 'idle' as SaveStatus }])));
  }, [activeGames]);

  const [savingAll, setSavingAll] = useState(false);

  if (!activeGames) return <p style={{ fontSize: 12, color: '#6B6357', marginTop: 12 }}>Cargando…</p>;

  const totalSeconds = activeGames.reduce((sum, g) => {
    const v = values[g.slug]!;
    if (v.dnf) return sum + g.penaltySeconds;
    // Sólo suma si parece un tiempo bien formado; si no, no rompe el total mientras se tipea.
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.time.trim());
    return m ? sum + Number(m[1]) * 60 + Number(m[2]) : sum;
  }, 0);

  function update(slug: string, patch: Partial<GameValue>) {
    setValues((prev) => ({ ...prev, [slug]: { ...prev[slug]!, ...patch, status: 'idle' } }));
  }

  /** Guarda un juego solo — RF-6b no exige cargar los tres juntos. */
  async function saveOne(slug: string) {
    if (!token) return;
    const v = values[slug]!;
    if (!hasInput(v)) return;
    setValues((prev) => ({ ...prev, [slug]: { ...prev[slug]!, status: 'saving', error: undefined } }));
    try {
      const res = await apiFetch<{ isPersonalBest?: boolean }>('/entries', {
        method: 'POST',
        accessToken: token,
        body: { groupId, puzzleDate: todayInArgentina(), gameSlug: slug, ...(v.dnf ? { dnf: true } : { time: v.time }) },
      });
      setValues((prev) => ({ ...prev, [slug]: { ...prev[slug]!, status: 'saved', isPersonalBest: res.isPersonalBest } }));
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.message : 'No pudimos guardar';
      setValues((prev) => ({ ...prev, [slug]: { ...prev[slug]!, status: 'error', error: msg } }));
    }
  }

  /** Guarda de una los juegos completados que todavía no se guardaron individualmente. */
  async function saveAll() {
    if (!activeGames) return;
    const pending = activeGames.filter((g) => hasInput(values[g.slug]!) && values[g.slug]!.status !== 'saved');
    if (!token || pending.length === 0) return;
    setSavingAll(true);
    try {
      const entries = pending.map((g) => {
        const v = values[g.slug]!;
        return v.dnf ? { gameSlug: g.slug, dnf: true } : { gameSlug: g.slug, time: v.time };
      });
      const res = await apiFetch<{
        results: { gameSlug: string; status: 'ok' | 'error'; error?: { message: string }; isPersonalBest?: boolean }[];
      }>('/entries/bulk', { method: 'POST', accessToken: token, body: { groupIds: [groupId], puzzleDate: todayInArgentina(), entries } });
      setValues((prev) => {
        const next = { ...prev };
        for (const r of res.results) {
          next[r.gameSlug] = {
            ...next[r.gameSlug]!,
            status: r.status === 'ok' ? 'saved' : 'error',
            error: r.error?.message,
            isPersonalBest: r.isPersonalBest,
          };
        }
        return next;
      });
    } finally {
      setSavingAll(false);
    }
  }

  const filledCount = activeGames.filter((g) => hasInput(values[g.slug]!)).length;
  const pendingCount = activeGames.filter((g) => hasInput(values[g.slug]!) && values[g.slug]!.status !== 'saved').length;

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 12, color: '#6B6357' }}>Lo que cargues a mano queda sin verificar. Podés guardar juego por juego.</p>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${activeGames.length}, 1fr)`, gap: 10 }}>
        {activeGames.map((g, i) => {
          const v = values[g.slug]!;
          return (
            <div key={g.slug} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
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
                disabled={v.dnf || v.status === 'saving'}
                onChange={(e) => update(g.slug, { time: e.target.value })}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={v.dnf}
                  disabled={v.status === 'saving'}
                  onChange={(e) => update(g.slug, { dnf: e.target.checked })}
                />
                No lo terminé
              </label>

              {v.status === 'saved' ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Chip kind="verified">Guardado</Chip>
                  {v.isPersonalBest && <Chip kind="pb">Récord personal</Chip>}
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline-dark"
                  style={{ marginTop: 8, height: 36, fontSize: 12, padding: '0 8px' }}
                  onClick={() => void saveOne(g.slug)}
                  disabled={!hasInput(v) || v.status === 'saving'}
                >
                  {v.status === 'saving' ? 'Guardando…' : 'Guardar'}
                </button>
              )}
              {v.status === 'error' && <p role="alert" style={{ color: '#A8352A', fontSize: 11, margin: '4px 0 0' }}>{v.error}</p>}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: '#6B6357' }}>
        DNF: {activeGames.map((g) => `${g.shortName} ${formatTime(g.penaltySeconds)}`).join(' · ')}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Total del día</span>
        <span className="lj-t" style={{ fontSize: 20 }}>{formatTime(totalSeconds)}</span>
      </div>
      {filledCount > 1 && pendingCount > 0 && (
        <button type="button" className="btn btn-primary" onClick={() => void saveAll()} disabled={savingAll}>
          {savingAll ? 'Guardando…' : pendingCount === activeGames.length ? `Guardar los ${activeGames.length}` : `Guardar los ${pendingCount} que faltan`}
        </button>
      )}
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
  /** Sólo viene en la confirmación (`/entries/import`) — el preview no escribe nada, no hay PB que evaluar. */
  isPersonalBest?: boolean;
  groups: { groupId: string; entry?: { durationSeconds: number; gameId: string } }[];
}
interface ImportPreview {
  gameName: string;
  puzzleDate: string;
  durationSeconds: number;
  dnf: boolean;
  verified: boolean;
  isPersonalBest?: boolean;
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
    isPersonalBest: r.isPersonalBest,
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
