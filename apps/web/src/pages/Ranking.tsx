import { useEffect, useState } from 'react';
import { formatTime, initialsOf } from '@liga/shared';
import { apiFetch } from '../api/client';
import { useSession } from '../hooks/useSession';
import { useActiveGroupContext } from '../hooks/useActiveGroupContext';
import { Chip } from '../components/ui';
import { NoGroupState } from '../components/NoGroupState';

type Period = 'week' | 'month';

interface Row {
  userId: string;
  displayName: string;
  avatar: string | null;
  rank: number | null;
  /** Empate real (no resuelto por RF-15) — el front tiene que decirlo, no fingir un 1º/2º. */
  tied: boolean;
  /** Sólo tiene valor en modo `position_points` (Fase 6, RF-13) — ver `scoringMode`. */
  points: number | null;
  totalSeconds: number | null;
  dnfCount: number;
  dailyWins: number;
  verifiedCount: number;
  verifiedTotal: number;
  gapToLeader: number | null;
}
interface GameRanking { gameSlug: string; gameName: string; rows: Row[] }
interface Winner { gameSlug: string; gameName: string; displayName: string; seconds: number }
interface Pending { userId: string; displayName: string }
interface LeaderboardResponse {
  period: { type: Period; startsOn: string; endsOn: string };
  /** RF-13/RF-17: config del grupo, igual para los N juegos activos. */
  scoringMode: 'total_time' | 'position_points';
  games: { slug: string; name: string }[];
  rankings: GameRanking[];
  todaysGameWinners: Winner[];
  pendingToday: Pending[];
}

/** RF-13, §5.2 — "cuántas veces le gané a cada uno", por juego. */
interface H2HRecord { opponentUserId: string; wins: number; losses: number }
interface H2HRow { userId: string; displayName: string; avatar: string | null; vs: H2HRecord[] }
interface GameH2H { gameSlug: string; gameName: string; rows: H2HRow[] }
interface H2HResponse { games: GameH2H[] }

/**
 * Artboard 03 · "Ranking": selector de juego + tabs semana/mes, podio, tabla; desktop aparte.
 * RF-11, RF-12, RF-15. Desde D2 (2026-09-01) cada juego tiene su propio ranking, sin total
 * combinado — por eso el selector de juego manda sobre qué tabla se pinta.
 */
export default function Ranking() {
  const { session } = useSession();
  const token = session?.access_token;
  const me = session?.user;
  const { activeGroup, loading: loadingMe } = useActiveGroupContext();

  const [period, setPeriod] = useState<Period>('month');
  const [gameSlug, setGameSlug] = useState<string | null>(null);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [h2h, setH2h] = useState<H2HResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !activeGroup) {
      setLoading(false); // sin grupo, no hay nada que pedir — si no, esto queda "Cargando…" para siempre
      return;
    }
    setLoading(true);
    Promise.all([
      apiFetch<LeaderboardResponse>(`/groups/${activeGroup.id}/leaderboard?period=${period}`, { accessToken: token }),
      apiFetch<H2HResponse>(`/groups/${activeGroup.id}/h2h?period=${period}`, { accessToken: token }),
    ])
      .then(([res, h2hRes]) => {
        setData(res);
        setH2h(h2hRes);
        // El juego seleccionado sigue vivo mientras exista en la respuesta nueva;
        // si no (cambió de grupo, o el admin desactivó ese juego), cae al primero.
        setGameSlug((prev) => (prev && res.rankings.some((r) => r.gameSlug === prev) ? prev : (res.rankings[0]?.gameSlug ?? null)));
      })
      .finally(() => setLoading(false));
  }, [token, activeGroup, period]);

  if (loadingMe) return <Screen><p style={{ color: '#6B6357' }}>Cargando…</p></Screen>;
  if (!activeGroup) return <NoGroupState />;

  const ranking = data?.rankings.find((r) => r.gameSlug === gameSlug) ?? null;

  return (
    <Screen>
      <div style={{ paddingBottom: 0, borderBottom: '1.5px solid #14120E' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 10 }}>
          <span className="lj-card-title" style={{ fontSize: 26 }}>Tabla</span>
          {data && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#6B6357' }}>{rangeLabel(data.period.startsOn, data.period.endsOn)}</span>}
        </div>
        {data && data.rankings.length > 1 && (
          <div style={{ display: 'flex', gap: 6, paddingBottom: 10, flexWrap: 'wrap' }}>
            {data.rankings.map((r) => (
              <GameTab key={r.gameSlug} label={r.gameName} active={r.gameSlug === gameSlug} onClick={() => setGameSlug(r.gameSlug)} />
            ))}
          </div>
        )}
        <div style={{ display: 'flex' }}>
          <TabButton label="Semana" active={period === 'week'} onClick={() => setPeriod('week')} />
          <TabButton label="Mes" active={period === 'month'} onClick={() => setPeriod('month')} />
        </div>
      </div>

      {loading || !data || !ranking ? (
        <p style={{ color: '#6B6357' }}>Cargando…</p>
      ) : ranking.rows.length === 0 ? (
        <p style={{ color: '#6B6357', fontSize: 14, padding: '20px 0' }}>Todavía nadie cargó nada en este período.</p>
      ) : (
        <>
          <Podium
            rows={ranking.rows.filter((r) => (data.scoringMode === 'position_points' ? r.points !== null : r.totalSeconds !== null)).slice(0, 3)}
            pointsMode={data.scoringMode === 'position_points'}
          />

          <div className="lj-card">
            <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 78px', gap: 8, padding: '7px 14px', background: '#F1EBDD', borderBottom: '1px solid #DDD6C8', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6357' }}>
              <span>Pos</span><span>Jugador</span><span style={{ textAlign: 'right' }}>{data.scoringMode === 'position_points' ? 'Puntos' : 'Tiempo'}</span>
            </div>
            {ranking.rows.map((r) => (
              <RankingRow key={r.userId} row={r} isMe={r.userId === me?.id} pointsMode={data.scoringMode === 'position_points'} />
            ))}
          </div>

          {(data.todaysGameWinners.length > 0 || data.pendingToday.length > 0) && (
            <div className="lj-ranking-panels" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {data.todaysGameWinners.length > 0 && (
                <div className="lj-card">
                  <div style={{ padding: '11px 14px', borderBottom: '1px solid #DDD6C8', background: '#F1EBDD' }} className="lj-label">Ganadores del día</div>
                  {data.todaysGameWinners.map((w, i) => (
                    <div key={w.gameSlug} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderBottom: i < data.todaysGameWinners.length - 1 ? '1px solid #EDE7DA' : 'none' }}>
                      <span style={{ fontSize: 14 }}>{w.gameName}</span>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{w.displayName} · <span className="lj-t">{formatTime(w.seconds)}</span></span>
                    </div>
                  ))}
                </div>
              )}
              {data.pendingToday.length > 0 && (
                <div className="lj-card" style={{ padding: 14 }}>
                  <div className="lj-label" style={{ marginBottom: 8 }}>Faltan cargar</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {data.pendingToday.map((p) => (
                      <span key={p.userId} style={{ border: '1px solid #DDD6C8', padding: '5px 10px', fontSize: 12, color: '#4A4438' }}>{p.displayName}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <H2HCard games={h2h?.games ?? []} gameSlug={gameSlug} myUserId={me?.id} />
        </>
      )}
    </Screen>
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

function Podium({ rows, pointsMode }: { rows: Row[]; pointsMode: boolean }) {
  if (rows.length === 0) return null;
  const order = rows.length === 3 ? [rows[1], rows[0], rows[2]] : rows; // 2do-1ro-3ro visualmente
  return (
    <div style={{ display: 'grid', gridTemplateColumns: rows.length === 3 ? '1fr 1.15fr 1fr' : `repeat(${rows.length}, 1fr)`, gap: 1, background: '#DDD6C8', borderBottom: '1.5px solid #14120E' }}>
      {order.map((r) => {
        if (!r) return null;
        const isFirst = r.rank === 1;
        return (
          <div
            key={r.userId}
            style={{
              background: isFirst ? '#16513C' : '#FBF8F1',
              color: isFirst ? '#F6F2EA' : '#14120E',
              padding: isFirst ? '12px 8px' : '14px 8px 12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span style={{
              width: isFirst ? 24 : 22, height: isFirst ? 24 : 22,
              background: isFirst ? '#F6F2EA' : 'transparent', color: isFirst ? '#16513C' : '#14120E',
              border: isFirst ? 'none' : '1px solid #14120E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'IBM Plex Mono', monospace", fontSize: isFirst ? 13 : 12, fontWeight: isFirst ? 700 : 600,
            }}>
              {r.rank}
            </span>
            <span style={{ width: isFirst ? 40 : 34, height: isFirst ? 40 : 34, border: `1px solid ${isFirst ? '#F6F2EA' : '#DDD6C8'}`, background: isFirst ? 'transparent' : '#F1EBDD', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isFirst ? 13 : 12, fontWeight: 600 }}>
              {initialsOf(r.displayName)}
            </span>
            <span style={{ fontSize: isFirst ? 14 : 13, fontWeight: isFirst ? 700 : 600 }}>{r.displayName}</span>
            <span className="lj-t" style={{ fontSize: isFirst ? 21 : 16, fontWeight: isFirst ? 700 : 600 }}>{pointsMode ? `${r.points} pts` : formatTime(r.totalSeconds!)}</span>
            {(isFirst || r.tied) && (
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', opacity: 0.85 }}>
                {isFirst && r.tied ? 'Puntera · Empate' : isFirst ? 'Puntera' : 'Empate'}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RankingRow({ row, isMe, pointsMode }: { row: Row; isMe: boolean; pointsMode: boolean }) {
  const participates = pointsMode ? row.points !== null : row.totalSeconds !== null;
  const variant = isMe ? 'me' : row.rank === 1 ? 'leader' : !participates ? 'idle' : 'default';
  const bg = variant === 'me' ? '#EFF4EF' : variant === 'leader' ? '#FBF8F1' : '#fff';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 78px', gap: 8, alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid #EDE7DA', background: bg, borderLeft: variant === 'me' ? '4px solid #16513C' : 'none' }}>
      <span className="lj-t" style={{ fontSize: 17 }}>{row.rank ?? '—'}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span className="lj-avatar">{initialsOf(row.displayName)}</span>
        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.displayName}</span>
        {row.verifiedTotal > 0 && row.verifiedCount === row.verifiedTotal && <span className="lj-seal" style={{ color: '#16513C' }}>✓</span>}
        {row.tied && <Chip kind="tied">Empate</Chip>}
        {row.dnfCount > 0 && <Chip kind="dnf">{row.dnfCount} DNF</Chip>}
        {row.dailyWins > 0 && <Chip kind="wins">{row.dailyWins} victorias</Chip>}
      </div>
      <span className="lj-t" style={{ textAlign: 'right', fontSize: 17 }}>
        {pointsMode ? (row.points !== null ? `${row.points} pts` : '—') : row.totalSeconds !== null ? formatTime(row.totalSeconds) : '—'}
      </span>
    </div>
  );
}

/**
 * RF-13, §5.2 — "cabeza a cabeza": cuántas veces le gané a cada rival, en el
 * juego seleccionado. Mi propio historial, no la matriz completa del grupo —
 * con más de 3-4 jugadores una matriz NxN no entra en una pantalla de celular
 * (RNF-2), y "cuántas veces le gané a cada uno" ya está formulado en primera
 * persona en el requerimiento.
 */
function H2HCard({ games, gameSlug, myUserId }: { games: GameH2H[]; gameSlug: string | null; myUserId: string | undefined }) {
  const game = games.find((g) => g.gameSlug === gameSlug);
  const myRow = game?.rows.find((r) => r.userId === myUserId);
  if (!myRow || myRow.vs.length === 0) return null;

  return (
    <div className="lj-card">
      <div style={{ padding: '11px 14px', borderBottom: '1px solid #DDD6C8', background: '#F1EBDD' }} className="lj-label">
        Cabeza a cabeza · {game!.gameName}
      </div>
      {myRow.vs.map((v, i) => {
        const opponent = game!.rows.find((r) => r.userId === v.opponentUserId);
        return (
          <div
            key={v.opponentUserId}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < myRow.vs.length - 1 ? '1px solid #EDE7DA' : 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="lj-avatar">{initialsOf(opponent?.displayName ?? '?')}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{opponent?.displayName ?? 'Ex-miembro'}</span>
            </div>
            <span className="lj-t" style={{ fontSize: 13 }}>
              <span style={{ color: '#16513C', fontWeight: 700 }}>{v.wins}</span> — <span style={{ color: '#A8352A', fontWeight: 700 }}>{v.losses}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function rangeLabel(start: string, end: string): string {
  const fmt = (d: string) => Number(d.slice(8, 10));
  const month = new Date(`${end}T00:00:00Z`).toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' });
  return start.slice(5, 7) === end.slice(5, 7) ? `${fmt(start)}–${fmt(end)} ${month}` : `${start.slice(8, 10)}/${start.slice(5, 7)} – ${end.slice(8, 10)}/${end.slice(5, 7)}`;
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="lj-ranking-screen" style={{ maxWidth: 420, margin: '0 auto', padding: '20px 20px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {children}
    </div>
  );
}
