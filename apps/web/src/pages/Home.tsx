import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatTime, GAMES, initialsOf } from '@liga/shared';
import { apiFetch } from '../api/client';
import { useSession } from '../hooks/useSession';
import { useActiveGroupContext } from '../hooks/useActiveGroupContext';
import { Chip, PositionBadge } from '../components/ui';
import { NoGroupState } from '../components/NoGroupState';

interface LeaderboardRow {
  userId: string;
  displayName: string;
  totalSeconds: number | null;
  rank: number | null;
  gapToPodium: number | null;
  deltaVsYesterday: number | null;
}
interface LeaderboardResponse {
  period: { type: string };
  rows: LeaderboardRow[];
}
interface DayCell { status: 'played' | 'dnf' | 'absent' | 'blackout'; seconds: number | null; verified: boolean }
interface DayRow { userId: string; displayName: string; avatar: string | null; cells: Record<string, DayCell> }
interface DayResponse { games: { slug: string; name: string }[]; rows: DayRow[] }

/** Artboard 01 · "Home", en sus dos estados. Ver specs/02-design.md §6.2, RF-18. */
export default function Home() {
  const { session } = useSession();
  const token = session?.access_token;
  const me = session?.user;
  const { activeGroup, loading: loadingMe } = useActiveGroupContext();
  const navigate = useNavigate();

  const [lb, setLb] = useState<LeaderboardResponse | null>(null);
  const [day, setDay] = useState<DayResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !activeGroup) {
      // Sin grupo activo (recién registrado, o mientras /me todavía resuelve) no hay
      // nada que pedir — sin este corte, `loading` se queda en true para siempre y la
      // pantalla nunca llega a mostrar el estado "Todavía no tenés grupo".
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      apiFetch<LeaderboardResponse>(`/groups/${activeGroup.id}/leaderboard?period=month`, { accessToken: token }),
      apiFetch<DayResponse>(`/groups/${activeGroup.id}/day`, { accessToken: token }),
    ])
      .then(([lbRes, dayRes]) => {
        setLb(lbRes);
        setDay(dayRes);
      })
      .finally(() => setLoading(false));
  }, [token, activeGroup]);

  if (loadingMe || loading) return <Screen><p style={{ color: '#6B6357' }}>Cargando…</p></Screen>;

  if (!activeGroup) return <NoGroupState />;

  if (!lb || !day) return <Screen><p role="alert" style={{ color: '#A8352A' }}>No pudimos cargar tu tabla.</p></Screen>;

  const myRow = lb.rows.find((r) => r.userId === me?.id) ?? null;
  const myDay = day.rows.find((r) => r.userId === me?.id) ?? null;
  const myGamesLoaded = myDay ? GAMES.filter((g) => myDay.cells[g.slug]?.status !== 'absent' && myDay.cells[g.slug]?.status !== 'blackout') : [];
  const loadedAllThree = myGamesLoaded.length === GAMES.length;

  const othersLoadedToday = day.rows
    .filter((r) => r.userId !== me?.id)
    .filter((r) => GAMES.every((g) => r.cells[g.slug]?.status === 'played' || r.cells[g.slug]?.status === 'dnf'))
    .map((r) => r.displayName);

  // Podio de hoy: entre quienes tienen el día completo, por menor suma (RF-12).
  const podium = day.rows
    .filter((r) => GAMES.every((g) => r.cells[g.slug]?.status === 'played' || r.cells[g.slug]?.status === 'dnf'))
    .map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      totalSeconds: GAMES.reduce((s, g) => s + (r.cells[g.slug]?.seconds ?? 0), 0),
      verified: GAMES.every((g) => r.cells[g.slug]?.verified),
    }))
    .sort((a, b) => a.totalSeconds - b.totalSeconds)
    .slice(0, 3);

  return (
    <Screen>
      <Eyebrow>{activeGroup.name}</Eyebrow>

      {loadedAllThree ? <LoadedCard myDay={myDay!} rank={myRow?.rank ?? null} /> : <NotLoadedCard othersLoadedToday={othersLoadedToday} onLoad={() => navigate('/cargar')} />}

      {myRow && (
        <div style={{ background: '#fff', border: '1px solid #DDD6C8', borderLeft: '4px solid #16513C', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="lj-label">Tu posición · este mes</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="lj-display" style={{ fontSize: 52, lineHeight: 0.9 }}>{myRow.rank ?? '—'}º</span>
              {myRow.deltaVsYesterday !== null && myRow.deltaVsYesterday !== 0 && (
                <span className="lj-t" style={{ fontSize: 13, color: '#16513C' }}>
                  {myRow.deltaVsYesterday > 0 ? '▲' : '▼'} {Math.abs(myRow.deltaVsYesterday)}
                </span>
              )}
              <span style={{ fontSize: 11, color: '#6B6357' }}>vs. ayer</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="lj-label">Total mes</span>
            <span className="lj-t" style={{ fontSize: 22 }}>{myRow.totalSeconds !== null ? formatTime(myRow.totalSeconds) : '—'}</span>
            {myRow.gapToPodium !== null && myRow.gapToPodium > 0 && (
              <span style={{ fontSize: 11, color: '#6B6357' }}>a {formatTime(myRow.gapToPodium)} del podio</span>
            )}
          </div>
        </div>
      )}

      {podium.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #DDD6C8' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderBottom: '1px solid #DDD6C8', background: '#F1EBDD' }}>
            <span className="lj-label" style={{ color: '#4A4438' }}>Podio de hoy</span>
            <Link to="/dia/hoy" style={{ fontSize: 12, color: '#16513C', textDecoration: 'none', borderBottom: '1px solid #16513C' }}>Ver el día</Link>
          </div>
          {podium.map((p, i) => (
            <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderBottom: i < podium.length - 1 ? '1px solid #EDE7DA' : 'none' }}>
              <PositionBadge position={i + 1} />
              <span className="lj-avatar">{initialsOf(p.displayName)}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{p.displayName}</span>
              {p.verified && <span className="lj-seal" style={{ color: '#16513C' }}>✓</span>}
              <span className="lj-t" style={{ fontSize: 15 }}>{formatTime(p.totalSeconds)}</span>
            </div>
          ))}
        </div>
      )}
    </Screen>
  );
}

function NotLoadedCard({ othersLoadedToday, onLoad }: { othersLoadedToday: string[]; onLoad: () => void }) {
  return (
    <div style={{ position: 'relative', background: '#fff', border: '1.5px solid #14120E', padding: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="lj-label" style={{ color: '#A8352A' }}>Hoy</span>
        <span className="lj-display" style={{ fontSize: 29, lineHeight: 1.08 }}>Todavía no cargaste lo de hoy</span>
        {othersLoadedToday.length > 0 && (
          <span style={{ fontSize: 13, lineHeight: 1.6, color: '#4A4438' }}>
            {joinNames(othersLoadedToday)} ya {othersLoadedToday.length === 1 ? 'cargó' : 'cargaron'} los tres.
          </span>
        )}
      </div>
      <button type="button" className="btn btn-primary" style={{ marginTop: 16, width: '100%', height: 56, fontSize: 17 }} onClick={onLoad}>
        Cargar mis tiempos
      </button>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: '#6B6357' }}>
        <span className="lj-seal" style={{ color: '#16513C' }}>✓</span> Pegá el link y se carga solo
      </div>
    </div>
  );
}

function LoadedCard({ myDay, rank }: { myDay: DayRow; rank: number | null }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DDD6C8' }}>
      <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid #DDD6C8' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="lj-label" style={{ color: '#16513C' }}>Listo por hoy</span>
          <span className="lj-card-title" style={{ fontSize: 27 }}>Cargaste los tres</span>
        </div>
        {rank !== null && (
          <div style={{ textAlign: 'right' }}>
            <div className="lj-display" style={{ fontSize: 34 }}>{rank}º</div>
            <div className="lj-label" style={{ fontSize: 10 }}>del mes</div>
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {GAMES.map((g, i) => {
          const cell = myDay.cells[g.slug];
          return (
            <div key={g.slug} style={{ padding: '12px 10px', borderRight: i < 2 ? '1px solid #DDD6C8' : undefined, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6B6357' }}>{g.name}</span>
              <span className="lj-t" style={{ fontSize: 24 }}>{cell?.seconds !== null && cell?.seconds !== undefined ? formatTime(cell.seconds) : '--:--'}</span>
              {cell?.verified ? <Chip kind="verified">Verificado</Chip> : <Chip kind="manual">A mano</Chip>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 420, margin: '0 auto', padding: '20px 20px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>;
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="lj-label" style={{ margin: 0 }}>{children}</p>;
}
