import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatTime, todayInArgentina, addDays, initialsOf, GAMES } from '@liga/shared';
import { apiFetch } from '../api/client';
import { useSession } from '../hooks/useSession';
import { useActiveGroupContext } from '../hooks/useActiveGroupContext';

interface DayCell { status: 'played' | 'dnf' | 'absent' | 'blackout'; seconds: number | null; verified: boolean }
interface DayRow { userId: string; displayName: string; avatar: string | null; cells: Record<string, DayCell> }
interface DayResponse {
  puzzleDate: string;
  memberCount: number;
  loadedCount: number;
  games: { slug: string; name: string }[];
  rows: DayRow[];
  bestPerGame: Record<string, { userId: string; seconds: number } | null>;
}

/** Artboard 04 · "Detalle del día": grilla jugador × juego, navegación ← →. RF-12, RF-20. */
export default function Dia() {
  const { fecha } = useParams<{ fecha: string }>();
  const navigate = useNavigate();
  const { session } = useSession();
  const token = session?.access_token;
  const { activeGroup, loading: loadingMe } = useActiveGroupContext();

  const puzzleDate = !fecha || fecha === 'hoy' ? todayInArgentina() : fecha;

  const [data, setData] = useState<DayResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !activeGroup) return;
    setLoading(true);
    apiFetch<DayResponse>(`/groups/${activeGroup.id}/day?date=${puzzleDate}`, { accessToken: token })
      .then(setData)
      .finally(() => setLoading(false));
  }, [token, activeGroup, puzzleDate]);

  if (loadingMe || !activeGroup) return <Screen><p style={{ color: '#6B6357' }}>Cargando…</p></Screen>;

  return (
    <Screen>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1.5px solid #14120E' }}>
        <button type="button" aria-label="Día anterior" onClick={() => navigate(`/dia/${addDays(puzzleDate, -1)}`)} style={navBtnStyle}>←</button>
        <div style={{ textAlign: 'center' }}>
          <div className="lj-card-title" style={{ fontSize: 22 }}>{formatLongDate(puzzleDate)}</div>
          {data && <div className="lj-label" style={{ fontSize: 10 }}>{data.loadedCount} DE {data.memberCount} CARGARON</div>}
        </div>
        <button
          type="button"
          aria-label="Día siguiente"
          onClick={() => navigate(`/dia/${addDays(puzzleDate, 1)}`)}
          disabled={puzzleDate >= todayInArgentina()}
          style={{ ...navBtnStyle, opacity: puzzleDate >= todayInArgentina() ? 0.3 : 1 }}
        >
          →
        </button>
      </div>

      {loading || !data ? (
        <p style={{ color: '#6B6357' }}>Cargando…</p>
      ) : data.rows.length === 0 ? (
        <p style={{ color: '#6B6357', fontSize: 14, padding: '20px 0' }}>Nadie cargó nada este día todavía.</p>
      ) : (
        <>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: `1fr repeat(${data.games.length}, 68px)`, padding: '8px 14px', background: '#F1EBDD', borderBottom: '1.5px solid #14120E', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: '#6B6357' }}>
              <span>Jugador</span>
              {data.games.map((g) => <span key={g.slug} style={{ textAlign: "right" }}>{GAMES.find((x) => x.slug === g.slug)?.shortName ?? g.name}</span>)}
            </div>
            {data.rows.map((row) => (
              <DayGridRow key={row.userId} row={row} games={data.games} bestPerGame={data.bestPerGame} />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 16, padding: '14px 0', fontSize: 11, color: '#6B6357', flexWrap: 'wrap' }}>
            <Legend swatch={<span style={{ width: 14, height: 14, background: '#16513C', display: 'inline-block' }} />} label="Mejor de la columna" />
            <Legend swatch={<span style={{ width: 14, height: 14, border: '1.5px solid #A8352A', color: '#A8352A', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700 }}>✕</span>} label="DNF (con castigo)" />
            <Legend swatch={<span style={{ width: 14, height: 14, border: '1px dashed #C9C0AC', display: 'inline-block' }} />} label="No cargó" />
          </div>
        </>
      )}
    </Screen>
  );
}

function DayGridRow({
  row,
  games,
  bestPerGame,
}: {
  row: DayRow;
  games: { slug: string; name: string }[];
  bestPerGame: Record<string, { userId: string; seconds: number } | null>;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `1fr repeat(${games.length}, 68px)`, alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid #EDE7DA' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span className="lj-avatar">{initialsOf(row.displayName)}</span>
        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.displayName}</span>
      </div>
      {games.map((g) => {
        const cell = row.cells[g.slug];
        const isBest = bestPerGame[g.slug]?.userId === row.userId && cell?.status === 'played';
        return (
          <span
            key={g.slug}
            className="lj-t"
            style={{ textAlign: 'right', fontSize: 14, color: cell?.status === 'dnf' ? '#A8352A' : isBest ? '#16513C' : '#14120E', fontWeight: isBest ? 700 : 600 }}
          >
            {cell?.status === 'played' || cell?.status === 'dnf' ? formatTime(cell.seconds!) : cell?.status === 'blackout' ? '·' : '—'}
          </span>
        );
      })}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {swatch}
      {label}
    </span>
  );
}


function formatLongDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const label = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const navBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', fontSize: 20, color: '#4A4438', cursor: 'pointer', padding: 8 };

function Screen({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 420, margin: '0 auto', padding: '20px 20px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>;
}
