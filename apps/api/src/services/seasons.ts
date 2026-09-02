import type { Pool, PoolClient } from 'pg';
import { todayInArgentina, weekBounds, monthBounds } from '@liga/shared';
import { db } from '../db.js';
import { loadRoster, loadGameIdBySlug, loadScoringInput } from './scoringData.js';
import { scoreTotalTime } from '../scoring/totalTime.js';
import { scorePositionPoints } from '../scoring/positionPoints.js';

/**
 * T7.1 (RF-16) — se llama desde `upsertEntry` cada vez que se carga un resultado.
 * Idempotente (`on conflict do nothing`): garantiza que exista una fila `open` en
 * `seasons` para cada período que el grupo trackea (`settings.period_types`), sin
 * la cual T7.2 no tendría nada que cerrar cuando el período termine.
 */
export async function ensureOpenSeasons(client: Pool | PoolClient, groupId: string, puzzleDate: string): Promise<void> {
  const groupRes = await client.query(`select settings from public.groups where id = $1`, [groupId]);
  const periodTypes: ('week' | 'month')[] = groupRes.rows[0]?.settings?.period_types ?? ['month'];

  for (const periodType of periodTypes) {
    const bounds = periodType === 'week' ? weekBounds(puzzleDate) : monthBounds(puzzleDate);
    await client.query(
      `insert into public.seasons (group_id, period_type, starts_on, ends_on, status)
       values ($1, $2, $3, $4, 'open')
       on conflict (group_id, period_type, starts_on) do nothing`,
      [groupId, periodType, bounds.start, bounds.end],
    );
  }
}

/**
 * T7.2 (RF-16) — cierra toda temporada `open` cuyo `ends_on` ya pasó: corre el
 * motor de puntuación sobre ese rango exacto de fechas y congela el resultado en
 * `final_standings` (un ranking por juego, D2) + `rules_snapshot` (settings
 * vigentes al momento del cierre, para que un cambio posterior no reescriba
 * temporadas ya cerradas — RF-17). Se llama desde el cron externo (routes/cron.ts).
 */
export async function closeExpiredSeasons(): Promise<{ closed: number }> {
  const today = todayInArgentina();
  const expired = await db.query(
    `select id, group_id, starts_on, ends_on from public.seasons where status = 'open' and ends_on < $1`,
    [today],
  );

  let closed = 0;
  for (const season of expired.rows) {
    const groupId = season.group_id as string;
    const startsOn = season.starts_on as string;
    const endsOn = season.ends_on as string;

    const groupRes = await db.query(`select settings from public.groups where id = $1`, [groupId]);
    if (groupRes.rows.length === 0) continue; // el grupo se borró; nada que congelar
    const settings = groupRes.rows[0].settings;

    const roster = await loadRoster(groupId);
    const gameIdBySlug = await loadGameIdBySlug();
    const input = await loadScoringInput(groupId, roster, gameIdBySlug, startsOn, endsOn);

    const result = input
      ? settings.scoring_mode === 'position_points'
        ? scorePositionPoints(input, settings.position_points ?? [5, 3, 2, 1])
        : scoreTotalTime(input)
      : { rankings: roster.games.map((g) => ({ gameSlug: g.slug, gameName: g.name, rows: [] })) };

    await db.query(
      `update public.seasons set status = 'closed', final_standings = $1, rules_snapshot = $2 where id = $3`,
      [JSON.stringify({ scoringMode: settings.scoring_mode ?? 'total_time', rankings: result.rankings }), JSON.stringify(settings), season.id],
    );
    closed += 1;
  }

  return { closed };
}

interface FrozenRanking {
  gameSlug: string;
  gameName: string;
  rows: { userId: string; displayName: string; rank: number | null }[];
}
interface SeasonRow {
  status: string;
  finalStandings: { rankings: FrozenRanking[] } | null;
}

/**
 * T7.3 (RF-16) — palmarés: cuántos títulos ganó cada jugador, por juego, contando
 * sólo temporadas cerradas. Un empate por el primer puesto (T4b.8, `rank === 1`
 * compartido) cuenta como título para los dos — nadie decide "quién ganó de
 * verdad" con una moneda. Función pura: separada de la query para poder testearla
 * sin Supabase (el resto de `seasons.ts` sí necesita la base).
 */
export function computePalmares(seasons: SeasonRow[]): { gameSlug: string; leaders: { userId: string; displayName: string; titles: number }[] }[] {
  const titles = new Map<string, Map<string, { displayName: string; count: number }>>(); // gameSlug -> userId -> {displayName, count}

  for (const s of seasons) {
    if (s.status !== 'closed' || !s.finalStandings) continue;
    for (const ranking of s.finalStandings.rankings ?? []) {
      for (const winner of ranking.rows.filter((row) => row.rank === 1)) {
        const byGame = titles.get(ranking.gameSlug) ?? new Map<string, { displayName: string; count: number }>();
        const entry = byGame.get(winner.userId) ?? { displayName: winner.displayName, count: 0 };
        entry.count += 1;
        byGame.set(winner.userId, entry);
        titles.set(ranking.gameSlug, byGame);
      }
    }
  }

  return [...titles.entries()].map(([gameSlug, byUser]) => ({
    gameSlug,
    leaders: [...byUser.entries()]
      .map(([userId, v]) => ({ userId, displayName: v.displayName, titles: v.count }))
      .sort((a, b) => b.titles - a.titles || a.displayName.localeCompare(b.displayName, 'es')),
  }));
}
