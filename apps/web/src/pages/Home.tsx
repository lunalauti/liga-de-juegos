import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatTime, initialsOf, todayInArgentina } from '@liga/shared';
import { apiFetch } from '../api/client';
import { useSession } from '../hooks/useSession';
import { useActiveGroupContext } from '../hooks/useActiveGroupContext';
import { Chip, PositionBadge } from '../components/ui';
import { NoGroupState } from '../components/NoGroupState';
import { LoadingState } from '../components/LoadingState';
import { NotifyPrompt } from '../components/NotifyPrompt';
import { InstallTutorialModal } from '../components/InstallTutorial';

interface LeaderboardRow {
  userId: string;
  displayName: string;
  totalSeconds: number | null;
  points: number | null;
  rank: number | null;
  tied: boolean;
  gapToPodium: number | null;
  deltaVsYesterday: number | null;
}
interface GameRanking { gameSlug: string; gameName: string; rows: LeaderboardRow[] }
interface Pending { userId: string; displayName: string }
interface LeaderboardResponse {
  period: { type: string };
  scoringMode: 'total_time' | 'position_points';
  rankings: GameRanking[];
  pendingToday: Pending[];
}
interface DayCell { status: 'played' | 'dnf' | 'absent' | 'blackout'; seconds: number | null; verified: boolean }
interface DayRow { userId: string; displayName: string; avatar: string | null; cells: Record<string, DayCell> }
interface DayResponse { games: { slug: string; name: string }[]; rows: DayRow[] }

/** Artboard 01 · "Home", en sus dos estados. Ver specs/02-design.md §6.2, RF-18. */
export default function Home() {
  const { session } = useSession();
  const token = session?.access_token;
  const { activeGroup, me, loading: loadingMe } = useActiveGroupContext();
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

  if (loadingMe || loading) return <Screen><LoadingState /></Screen>;

  if (!activeGroup) return <NoGroupState />;

  if (!lb || !day) return <Screen><p role="alert" style={{ color: '#A8352A' }}>No pudimos cargar tu tabla.</p></Screen>;

  // Bug real reportado por el usuario: esto usaba el catálogo estático de 3
  // juegos en vez de los que el grupo tiene realmente activos (RF-5, toggle en
  // Ajustes) — con un solo juego activo, "Cargaste los tres" se mostraba con uno
  // solo cargado, porque `cells[slug]` para un juego desactivado es `undefined`,
  // y `undefined !== 'absent'` da `true` (falso positivo). `day.games` ya viene
  // filtrado por `enabled = true` desde el servidor: es la fuente correcta.
  const activeGames = day.games;
  const myDay = day.rows.find((r) => r.userId === me?.id) ?? null;
  const myGamesLoaded = myDay ? activeGames.filter((g) => myDay.cells[g.slug]?.status !== 'absent' && myDay.cells[g.slug]?.status !== 'blackout') : [];
  const loadedAllThree = activeGames.length > 0 && myGamesLoaded.length === activeGames.length;

  const othersLoadedToday = day.rows
    .filter((r) => r.userId !== me?.id)
    .filter((r) => activeGames.every((g) => r.cells[g.slug]?.status === 'played' || r.cells[g.slug]?.status === 'dnf'))
    .map((r) => r.displayName);

  // D2 (2026-09-01): "tu posición" pasa a ser una por juego, no un único número
  // sumado. `lb.rankings` ya trae una tabla independiente por juego activo.
  const myPositions = lb.rankings
    .map((ranking) => ({ ranking, row: ranking.rows.find((r) => r.userId === me?.id) ?? null }))
    .filter((p): p is { ranking: GameRanking; row: LeaderboardRow } => p.row !== null);

  // Podio de hoy, por juego (RF-12/RF-18): top 3 más rápidos de cada juego activo,
  // entre quienes lo completaron (un DNF no compite por el podio de velocidad).
  // Posición de competición estándar (1, 1, 3): dos tiempos iguales comparten
  // posición y quedan marcados `tied`, no se les inventa un 1º y un 2º.
  const gamePodiums = activeGames.map((g) => {
    const sorted = day.rows
      .filter((r) => r.cells[g.slug]?.status === 'played')
      .map((r) => ({ userId: r.userId, displayName: r.displayName, seconds: r.cells[g.slug]!.seconds!, verified: r.cells[g.slug]!.verified }))
      .sort((a, b) => a.seconds - b.seconds);
    const positions: number[] = [];
    const withPosition = sorted.map((r, i) => {
      const tiedWithPrev = i > 0 && sorted[i - 1]!.seconds === r.seconds;
      const tiedWithNext = i < sorted.length - 1 && sorted[i + 1]!.seconds === r.seconds;
      const position = tiedWithPrev ? positions[i - 1]! : i + 1;
      positions.push(position);
      return { ...r, position, tied: tiedWithPrev || tiedWithNext };
    });
    return { gameSlug: g.slug, gameName: g.name, rows: withPosition.slice(0, 3) };
  }).filter((gp) => gp.rows.length > 0);

  return (
    <Screen>
      <Header groupName={activeGroup.name} displayName={me?.displayName} />
      <InstallTutorialModal token={token} />
      <NotifyPrompt token={token} />

      {loadedAllThree ? <LoadedCard myDay={myDay!} games={activeGames} /> : <NotLoadedCard othersLoadedToday={othersLoadedToday} onLoad={() => navigate('/cargar')} />}

      {lb.pendingToday.length > 0 && (
        <div className="lj-card" style={{ padding: 14 }}>
          <div className="lj-label" style={{ marginBottom: 8 }}>Faltan cargar</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {lb.pendingToday.map((p) => (
              <span key={p.userId} style={{ border: '1px solid #DDD6C8', padding: '5px 10px', fontSize: 12, color: '#4A4438' }}>{p.displayName}</span>
            ))}
          </div>
        </div>
      )}

      {myPositions.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #DDD6C8' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #DDD6C8', background: '#F1EBDD' }}>
            <span className="lj-label" style={{ color: '#4A4438' }}>Tu posición · este mes</span>
          </div>
          {myPositions.map(({ ranking, row }, i) => (
            <div
              key={ranking.gameSlug}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px',
                borderBottom: i < myPositions.length - 1 ? '1px solid #EDE7DA' : 'none',
                borderLeft: '4px solid #16513C',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span className="lj-display" style={{ fontSize: 30, lineHeight: 0.9 }}>{row.rank ?? '—'}º</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{ranking.gameName}</span>
                {row.tied && <Chip kind="tied">Empate</Chip>}
                {row.deltaVsYesterday !== null && row.deltaVsYesterday !== 0 && (
                  <span className="lj-t" style={{ fontSize: 12, color: '#16513C' }}>
                    {row.deltaVsYesterday > 0 ? '▲' : '▼'} {Math.abs(row.deltaVsYesterday)}
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="lj-t" style={{ fontSize: 16 }}>
                  {lb.scoringMode === 'position_points'
                    ? row.points !== null ? `${row.points} pts` : '—'
                    : row.totalSeconds !== null ? formatTime(row.totalSeconds) : '—'}
                </span>
                {row.gapToPodium !== null && row.gapToPodium > 0 && (
                  <span style={{ fontSize: 10, color: '#6B6357' }}>
                    a {lb.scoringMode === 'position_points' ? `${row.gapToPodium} pts` : formatTime(row.gapToPodium)} del podio
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {gamePodiums.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #DDD6C8' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderBottom: '1px solid #DDD6C8', background: '#F1EBDD' }}>
            <span className="lj-label" style={{ color: '#4A4438' }}>Podio de hoy</span>
            <Link to="/dia/hoy" style={{ fontSize: 12, color: '#16513C', textDecoration: 'none', borderBottom: '1px solid #16513C' }}>Ver el día</Link>
          </div>
          {gamePodiums.map((gp, gi) => (
            <div key={gp.gameSlug} style={{ borderBottom: gi < gamePodiums.length - 1 ? '1px solid #DDD6C8' : 'none' }}>
              <div style={{ padding: '8px 14px 0', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8C8271' }}>{gp.gameName}</div>
              {gp.rows.map((p) => (
                <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 14px' }}>
                  <PositionBadge position={p.position} />
                  <span className="lj-avatar">{initialsOf(p.displayName)}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{p.displayName}</span>
                  {p.tied && <Chip kind="tied">Empate</Chip>}
                  {p.verified && <span className="lj-seal" style={{ color: '#16513C' }}>✓</span>}
                  <span className="lj-t" style={{ fontSize: 15 }}>{formatTime(p.seconds)}</span>
                </div>
              ))}
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

function LoadedCard({ myDay, games }: { myDay: DayRow; games: { slug: string; name: string }[] }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DDD6C8' }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #DDD6C8' }}>
        <span className="lj-label" style={{ color: '#16513C' }}>Listo por hoy</span>
        <div className="lj-card-title" style={{ fontSize: 27, marginTop: 2 }}>
          {games.length === 1 ? 'Cargaste el de hoy' : `Cargaste los ${games.length}`}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${games.length}, 1fr)` }}>
        {games.map((g, i) => {
          const cell = myDay.cells[g.slug];
          return (
            <div key={g.slug} style={{ padding: '12px 10px', borderRight: i < games.length - 1 ? '1px solid #DDD6C8' : undefined, display: 'flex', flexDirection: 'column', gap: 5 }}>
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

/**
 * Masthead consistente con el resto de las pantallas de primer nivel (artboard
 * 01: eyebrow + título serif + chip de avatar, con el mismo borde inferior de
 * 1.5px que separa el header del contenido en Cargar/Grupo/Stats). El artboard
 * original pone acá la fecha y "Liga de Juegos" como título fijo; se adaptó al
 * nombre del grupo activo como título porque esta app soporta pertenecer a más
 * de un grupo (algo que no existía cuando se dibujó el mockup) — sin eso, nadie
 * sabría a qué grupo está mirando al entrar.
 */
function Header({ groupName, displayName }: { groupName: string; displayName?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1.5px solid #14120E', paddingBottom: 12 }}>
      <div>
        <p className="lj-label" style={{ margin: 0 }}>{longDateLabel(todayInArgentina())}</p>
        <h1 className="lj-display" style={{ fontSize: 27, margin: '2px 0 0' }}>{groupName}</h1>
      </div>
      <Link
        to="/perfil"
        aria-label="Tu perfil"
        style={{ width: 34, height: 34, border: '1.5px solid #14120E', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flex: '0 0 auto', color: 'inherit', textDecoration: 'none' }}
      >
        {initialsOf(displayName ?? '?')}
      </Link>
    </div>
  );
}

function longDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const label = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
