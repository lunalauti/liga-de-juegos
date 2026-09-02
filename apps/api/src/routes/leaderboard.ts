import { Router } from 'express';
import { z } from 'zod';
import { todayInArgentina, weekBounds, monthBounds, addDays } from '@liga/shared';
import { db } from '../db.js';
import { notFound } from '../errors.js';
import { requireMember } from '../services/authz.js';
import { getCached, setCached } from '../services/leaderboardCache.js';
import { loadRoster, loadGameIdBySlug, loadScoringInput, type Roster } from '../services/scoringData.js';
import { scoreTotalTime } from '../scoring/totalTime.js';
import { scorePositionPoints } from '../scoring/positionPoints.js';

export const leaderboardRouter = Router();

const querySchema = z.object({
  period: z.enum(['week', 'month']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Corre el motor para un período y una fecha límite (clip a `until`, nunca al
 * futuro). Se reusa para el período actual y para "ayer" (delta_vs_yesterday).
 */
async function runScoring(groupId: string, roster: Roster, gameIdBySlug: Map<string, string>, start: string, until: string) {
  const input = await loadScoringInput(groupId, roster, gameIdBySlug, start, until);
  if (!input) return null;

  const settingsRes = await db.query(`select settings from public.groups where id = $1`, [groupId]);
  const settings = settingsRes.rows[0]?.settings ?? {};

  // RF-13/RF-17: el modo de puntuación es config del grupo, aplica igual a los N juegos activos.
  return settings.scoring_mode === 'position_points'
    ? scorePositionPoints(input, settings.position_points ?? [5, 3, 2, 1])
    : scoreTotalTime(input);
}

/** RF-11, RF-12, RF-15, T4.10 — ranking calculado, con cache de 60 s (§5.4). */
leaderboardRouter.get('/groups/:id/leaderboard', async (req, res, next) => {
  try {
    const groupId = req.params['id']!;
    await requireMember(groupId, req.user!.id);
    const query = querySchema.parse(req.query);

    const groupRes = await db.query(`select settings from public.groups where id = $1`, [groupId]);
    if (groupRes.rows.length === 0) throw notFound('Ese grupo no existe');
    const settings = groupRes.rows[0].settings;
    const scoringMode: 'total_time' | 'position_points' = settings.scoring_mode === 'position_points' ? 'position_points' : 'total_time';

    const period = query.period ?? settings.primary_period ?? 'month';
    const anchor = query.date ?? todayInArgentina();
    const today = todayInArgentina();
    const bounds = period === 'week' ? weekBounds(anchor) : monthBounds(anchor);
    const clippedEnd = bounds.end < today ? bounds.end : today;

    const cacheKey = `${groupId}:${period}:${anchor}`;
    const cached = getCached<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const roster = await loadRoster(groupId);
    const gameIdBySlug = await loadGameIdBySlug();

    if (clippedEnd < bounds.start) {
      // El período todavía no arrancó en el calendario del grupo (ej. mes que recién empieza mañana): nada que calcular.
      const empty = {
        period: { type: period, startsOn: bounds.start, endsOn: bounds.end, status: 'open' },
        scoringMode,
        games: roster.games,
        rankings: roster.games.map((g) => ({ gameSlug: g.slug, gameName: g.name, rows: [] })),
        todaysGameWinners: [],
        pendingToday: roster.members,
      };
      res.json(empty);
      return;
    }

    const result = await runScoring(groupId, roster, gameIdBySlug, bounds.start, clippedEnd);

    // delta_vs_yesterday: mismo período, un día menos. Si eso cae antes del
    // inicio del período, no hay base de comparación (T4.10).
    const yesterday = addDays(clippedEnd, -1);
    const yResult = yesterday >= bounds.start ? await runScoring(groupId, roster, gameIdBySlug, bounds.start, yesterday) : null;

    // D2 (2026-09-01): delta/gap se calculan DENTRO de cada juego — el líder y el
    // podio de Crucigrama no tienen nada que ver con los de Sudoku.
    // En total_time el líder es el de MENOS segundos y el gap es "cuánto te falta
    // para llegar" (siempre ≥ 0). En position_points el líder es el de MÁS puntos
    // y el gap es "cuántos puntos te faltan" — misma idea, unidad y signo invertidos.
    const rankings = (result?.rankings ?? []).map((ranking) => {
      const yRanking = yResult?.rankings.find((r) => r.gameSlug === ranking.gameSlug);
      const yesterdayRankByUser = new Map((yRanking?.rows ?? []).map((r) => [r.userId, r.rank]));

      const metric = (row: (typeof ranking.rows)[number]) => (scoringMode === 'position_points' ? row.points : row.totalSeconds);
      const withMetric = ranking.rows.filter((r) => metric(r) !== null);
      const leaderValue = withMetric[0] !== undefined ? metric(withMetric[0]) : null;
      const podiumValue = withMetric[2] !== undefined ? metric(withMetric[2]) : leaderValue;

      const rows = ranking.rows.map((row) => {
        const yRank = yesterdayRankByUser.get(row.userId) ?? null;
        const value = metric(row);
        const gap = (target: number | null) =>
          value !== null && target !== null ? (scoringMode === 'position_points' ? target - value : value - target) : null;
        return {
          ...row,
          deltaVsYesterday: yRank !== null && row.rank !== null ? yRank - row.rank : null,
          gapToLeader: gap(leaderValue),
          gapToPodium: gap(podiumValue),
        };
      });

      return { gameSlug: ranking.gameSlug, gameName: ranking.gameName, rows };
    });

    // Ganadores del día de HOY por juego (no por el período completo) — panel desktop del artboard 03.
    const todaysGameWinners = await computeTodaysGameWinners(groupId, roster.games, today);

    // Quiénes no cargaron nada hoy — siempre relativo a hoy, sin importar qué período se pidió.
    const loadedTodayRes = await db.query(
      `select distinct user_id from public.entries where group_id = $1 and puzzle_date = $2`,
      [groupId, today],
    );
    const loadedToday = new Set(loadedTodayRes.rows.map((r) => r.user_id as string));
    const pendingToday = roster.members.filter((m) => !loadedToday.has(m.userId));

    const payload = {
      period: { type: period, startsOn: bounds.start, endsOn: bounds.end, status: bounds.end < today ? 'closed' : 'open' },
      scoringMode,
      games: roster.games,
      rankings,
      todaysGameWinners,
      pendingToday,
    };

    setCached(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

async function computeTodaysGameWinners(
  groupId: string,
  games: { slug: string; name: string }[],
  today: string,
): Promise<Array<{ gameSlug: string; gameName: string; userId: string; displayName: string; seconds: number }>> {
  const r = await db.query(
    `select e.duration_seconds, e.user_id, p.display_name, g.slug as game_slug, g.name as game_name
       from public.entries e
       join public.profiles p on p.id = e.user_id
       join public.games g on g.id = e.game_id
      where e.group_id = $1 and e.puzzle_date = $2 and e.dnf = false
      order by e.duration_seconds asc`,
    [groupId, today],
  );
  const winners: Array<{ gameSlug: string; gameName: string; userId: string; displayName: string; seconds: number }> = [];
  const seen = new Set<string>();
  for (const row of r.rows) {
    if (seen.has(row.game_slug)) continue;
    seen.add(row.game_slug);
    winners.push({
      gameSlug: row.game_slug,
      gameName: row.game_name,
      userId: row.user_id,
      displayName: row.display_name,
      seconds: row.duration_seconds,
    });
  }
  // conservamos el orden del catálogo del grupo, no el orden en que aparecieron
  return games.map((g) => winners.find((w) => w.gameSlug === g.slug)).filter((w): w is (typeof winners)[number] => !!w);
}
