import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatTime, initialsOf } from '@liga/shared';
import { apiFetch } from '../api/client';
import { useSession } from '../hooks/useSession';
import { useActiveGroupContext } from '../hooks/useActiveGroupContext';
import { NoGroupState } from '../components/NoGroupState';
import { LoadingState } from '../components/LoadingState';

type Period = 'week' | 'month';

interface GameStats {
  gameSlug: string;
  gameName: string;
  personalBest: number | null;
  consistency: number | null;
  completion: number;
  trend: number | null;
  verifiedCount: number;
  verifiedTotal: number;
}
interface HistoryPoint { puzzleDate: string; perGame: Record<string, number | null> }
interface StatsResponse {
  period: { type: Period; startsOn: string; endsOn: string };
  currentStreak: number;
  bestStreak: number;
  games: GameStats[];
  history: HistoryPoint[];
}

/** Mismos colores que el artboard 04, por slug — se repiten si el grupo tiene más juegos. */
const GAME_COLORS: Record<string, string> = {
  crucigrama: '#16513C',
  'cruci-experto': '#C9A227',
  'sudoku-avanzado': '#8C8271',
};
const FALLBACK_COLORS = ['#16513C', '#C9A227', '#8C8271', '#A8352A', '#4A4438'];
function colorOf(slug: string, index: number): string {
  return GAME_COLORS[slug] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]!;
}

/**
 * T8.3 · artboard 04 — "Mis estadísticas". RF-14 (racha, consistencia, PB,
 * completado, verificados, mejora) + RF-19 (evolución a 14 días en gráfico).
 * La racha es holística (D11): una sola tarjeta, no por juego. Todo lo demás
 * es por juego, con un selector de tabs igual al de Ranking.tsx.
 */
export default function Stats() {
  const { session } = useSession();
  const token = session?.access_token;
  const { activeGroup, me, loading: loadingMe } = useActiveGroupContext();

  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<StatsResponse | null>(null);
  const [gameSlug, setGameSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !activeGroup) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<StatsResponse>(`/groups/${activeGroup.id}/stats?period=${period}`, { accessToken: token })
      .then((res) => {
        setData(res);
        setGameSlug((prev) => (prev && res.games.some((g) => g.gameSlug === prev) ? prev : (res.games[0]?.gameSlug ?? null)));
      })
      // Sin este catch, un fetch fallido dejaba el LoadingState pegado para
      // siempre en vez de avisar que algo salió mal (T9.2).
      .catch(() => setError('No pudimos cargar tus estadísticas. Probá de nuevo en un rato.'))
      .finally(() => setLoading(false));
  }, [token, activeGroup, period]);

  if (loadingMe) return <Screen><LoadingState /></Screen>;
  if (!activeGroup) return <NoGroupState />;

  const game = data?.games.find((g) => g.gameSlug === gameSlug) ?? null;

  return (
    <Screen>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1.5px solid #14120E', paddingBottom: 12 }}>
        <div>
          <div className="lj-label" style={{ marginBottom: 2 }}>Últimos 14 días</div>
          <h1 className="lj-display" style={{ fontSize: 26, margin: 0 }}>Mis estadísticas</h1>
        </div>
        <Link
          to="/perfil"
          aria-label="Tu perfil"
          style={{ width: 34, height: 34, border: '1.5px solid #14120E', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flex: '0 0 auto', color: 'inherit', textDecoration: 'none' }}
        >
          {initialsOf(me?.displayName ?? '?')}
        </Link>
      </div>

      <div style={{ display: 'flex' }}>
        <TabButton label="Semana" active={period === 'week'} onClick={() => setPeriod('week')} />
        <TabButton label="Mes" active={period === 'month'} onClick={() => setPeriod('month')} />
      </div>

      {error ? (
        <p role="alert" style={{ color: '#A8352A', fontSize: 14, padding: '20px 0' }}>{error}</p>
      ) : loading || !data ? (
        <LoadingState compact />
      ) : data.games.length === 0 ? (
        <p style={{ color: '#6B6357', fontSize: 14, padding: '20px 0' }}>Tu grupo no tiene juegos activos todavía.</p>
      ) : (
        <>
          <EvolutionChart games={data.games} history={data.history} />

          {data.games.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {data.games.map((g) => (
                <GameTab key={g.gameSlug} label={g.gameName} active={g.gameSlug === gameSlug} onClick={() => setGameSlug(g.gameSlug)} />
              ))}
            </div>
          )}

          {game && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <MetricCard
                  label="Récord personal"
                  value={game.personalBest !== null ? formatTime(game.personalBest) : '—'}
                  caption={game.gameName}
                  accent
                />
                <MetricCard
                  label="Racha actual"
                  value={`${data.currentStreak} día${data.currentStreak === 1 ? '' : 's'}`}
                  caption={`Tu mejor: ${data.bestStreak}`}
                  display
                />
                <MetricCard
                  label="Consistencia"
                  value={game.consistency !== null ? `±${formatTime(Math.round(game.consistency))}` : '—'}
                  caption="Desvío sobre tu media"
                />
                <MetricCard
                  label="Completado"
                  value={`${Math.round(game.completion * 100)}%`}
                  caption={trendCaption(game.trend)}
                  captionColor={trendColor(game.trend)}
                />
              </div>

              <div style={{ background: '#F1EBDD', border: '1px solid #DDD6C8', padding: '12px 13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#4A4438' }}>Tiempos verificados</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, color: '#16513C' }}>
                  <span style={{ width: 14, height: 14, border: '1.2px solid #16513C', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>✓</span>
                  {game.verifiedCount} de {game.verifiedTotal}
                </span>
              </div>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

/** "Mejoraste 12s" / "Empeoraste 8s" contra el período anterior — RF-14 "Mejora". Negativo = mejoró. */
function trendCaption(trend: number | null): string {
  if (trend === null) return 'Sin datos del período anterior';
  if (Math.abs(trend) < 1) return 'Igual que el período anterior';
  const abs = formatTime(Math.round(Math.abs(trend)));
  return trend < 0 ? `Mejoraste ${abs}` : `Empeoraste ${abs}`;
}
function trendColor(trend: number | null): string | undefined {
  if (trend === null || Math.abs(trend) < 1) return undefined;
  return trend < 0 ? '#16513C' : '#A8352A';
}

function EvolutionChart({ games, history }: { games: GameStats[]; history: HistoryPoint[] }) {
  const width = 320;
  const height = 150;
  const padTop = 8;
  const padBottom = 20;

  const { min, max } = useMemo(() => {
    const values = history.flatMap((h) => games.map((g) => h.perGame[g.gameSlug]).filter((v): v is number => v !== null && v !== undefined));
    if (values.length === 0) return { min: 0, max: 1 };
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    return hi > lo ? { min: lo, max: hi } : { min: lo - 1, max: hi + 1 };
  }, [games, history]);

  const step = history.length > 1 ? width / (history.length - 1) : width;
  const y = (v: number) => padTop + (1 - (v - min) / (max - min)) * (height - padTop - padBottom);

  const lines = games.map((g, i) => {
    const points = history
      .map((h, idx) => {
        const v = h.perGame[g.gameSlug];
        return v === null || v === undefined ? null : `${idx * step},${y(v).toFixed(1)}`;
      })
      .filter((p): p is string => p !== null);
    // findLastIndex no está en el target ES2022 del proyecto — recorrido manual hacia atrás.
    let lastIdx = -1;
    for (let idx = history.length - 1; idx >= 0; idx--) {
      const v = history[idx]!.perGame[g.gameSlug];
      if (v !== null && v !== undefined) { lastIdx = idx; break; }
    }
    const lastValue = lastIdx >= 0 ? history[lastIdx]!.perGame[g.gameSlug] : null;
    const lastPoint: { x: number; y: number } | null =
      lastIdx >= 0 && lastValue !== null && lastValue !== undefined ? { x: lastIdx * step, y: y(lastValue) } : null;
    return { gameSlug: g.gameSlug, color: colorOf(g.gameSlug, i), points, lastPoint };
  });

  const hasAnyData = lines.some((l) => l.points.length > 0);
  const gridLines = [0.2, 0.4, 0.6, 0.8].map((f) => padTop + f * (height - padTop - padBottom));
  const first = history[0]?.puzzleDate;
  const mid = history[Math.floor(history.length / 2)]?.puzzleDate;
  const last = history[history.length - 1]?.puzzleDate;

  return (
    <div style={{ background: '#fff', border: '1px solid #DDD6C8', padding: '14px 12px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 2px' }}>
        <span className="lj-label">Evolución por juego</span>
        <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#4A4438', flexWrap: 'wrap' }}>
          {games.map((g, i) => (
            <span key={g.gameSlug} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 2, background: colorOf(g.gameSlug, i) }} />
              {shortLabel(g.gameName)}
            </span>
          ))}
        </div>
      </div>
      {hasAnyData ? (
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 150, display: 'block' }}>
          <rect x={0} y={0} width={width} height={height} fill="#FBF8F1" />
          <g stroke="#E7E0D2" strokeWidth={1}>
            {gridLines.map((gy) => <line key={gy} x1={0} y1={gy} x2={width} y2={gy} />)}
          </g>
          {lines.map((l) => (
            <polyline key={l.gameSlug} fill="none" stroke={l.color} strokeWidth={2.2} points={l.points.join(' ')} />
          ))}
          {lines.map((l) => l.lastPoint && (
            <circle key={l.gameSlug} cx={l.lastPoint.x} cy={l.lastPoint.y} r={3.5} fill={l.color} />
          ))}
        </svg>
      ) : (
        <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8C8271', fontSize: 13, background: '#FBF8F1' }}>
          Todavía no hay resultados en estos 14 días
        </div>
      )}
      {hasAnyData && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#8C8271', padding: '6px 2px 0' }}>
          <span>{first ? shortDate(first) : ''}</span>
          <span>{mid ? shortDate(mid) : ''}</span>
          <span>{last ? shortDate(last) : ''}</span>
        </div>
      )}
    </div>
  );
}

function shortLabel(name: string): string {
  return name.length <= 6 ? name : `${name.slice(0, 4)}.`;
}
function shortDate(d: string): string {
  const date = new Date(`${d}T00:00:00Z`);
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function MetricCard({ label, value, caption, captionColor, accent, display }: { label: string; value: string; caption: string; captionColor?: string; accent?: boolean; display?: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DDD6C8', borderTop: accent ? '3px solid #16513C' : undefined, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="lj-label">{label}</span>
      <span className={display ? 'lj-display' : 'lj-t'} style={{ fontSize: display ? 26 : 28, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 11, color: captionColor ?? '#6B6357' }}>{caption}</span>
    </div>
  );
}

function GameTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px',
        background: active ? '#16513C' : '#fff',
        color: active ? '#F6F2EA' : '#4A4438',
        border: `1px solid ${active ? '#16513C' : '#DDD6C8'}`,
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '10px 0',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '3px solid #16513C' : '3px solid transparent',
        marginBottom: -1.5,
        fontSize: 14,
        fontWeight: active ? 700 : 400,
        color: active ? '#16513C' : '#6B6357',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '20px 20px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {children}
    </div>
  );
}
