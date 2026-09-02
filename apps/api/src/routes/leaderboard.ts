import { Router } from 'express';
import { z } from 'zod';
import { todayInArgentina, weekBounds, monthBounds, addDays } from '@liga/shared';
import { db } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { requireMember } from '../services/authz.js';
import { getCached, setCached } from '../services/leaderboardCache.js';
import { scoreTotalTime } from '../scoring/totalTime.js';
import type { ScoringInput } from '../scoring/types.js';

export const leaderboardRouter = Router();

const querySchema = z.object({
  period: z.enum(['week', 'month']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

interface Roster {
  members: { userId: string; displayName: string; avatar: string | null }[];
  games: { slug: string; name: string; penaltySeconds: number }[];
}

async function loadRoster(groupId: string): Promise<Roster> {
  const [membersRes, gamesRes] = await Promise.all([
    db.query(
      `select p.id, p.display_name, p.avatar
         from public.group_members gm join public.profiles p on p.id = gm.user_id
        where gm.group_id = $1`,
      [groupId],
    ),
    db.query(
      `select g.slug, g.name, gg.penalty_seconds
         from public.group_games gg join public.games g on g.id = gg.game_id
        where gg.group_id = $1 and gg.enabled = true
        order by g.sort_order`,
      [groupId],
    ),
  ]);
  return {
    members: membersRes.rows.map((m) => ({ userId: m.id, displayName: m.display_name, avatar: m.avatar })),
    games: gamesRes.rows.map((g) => ({ slug: g.slug, name: g.name, penaltySeconds: g.penalty_seconds })),
  };
}

async function loadEntries(groupId: string, from: string, to: string) {
  const r = await db.query(
    `select user_id, game_id, puzzle_date, duration_seconds, dnf, verified
       from public.entries
      where group_id = $1 and puzzle_date between $2 and $3`,
    [groupId, from, to],
  );
  return r.rows;
}

async function loadBlackouts(groupId: string, from: string, to: string) {
  const r = await db.query(
    `select bd.puzzle_date, g.slug as game_slug
       from public.blackout_dates bd
       left join public.games g on g.id = bd.game_id
      where bd.group_id = $1 and bd.puzzle_date between $2 and $3`,
    [groupId, from, to],
  );
  return r.rows.map((b) => ({ puzzleDate: b.puzzle_date as string, gameSlug: (b.game_slug as string) ?? null }));
}

function buildDays(start: string, end: string): string[] {
  const days: string[] = [];
  let cur = start;
  while (cur <= end) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return days;
}

/**
 * Corre el motor para un período y una fecha límite (clip a `until`, nunca al
 * futuro). Se reusa para el período actual y para "ayer" (delta_vs_yesterday).
 */
async function runScoring(groupId: string, roster: Roster, gameIdBySlug: Map<string, string>, start: string, until: string) {
  const days = buildDays(start, until);
  if (days.length === 0) return null;

  const [entriesRaw, blackouts] = await Promise.all([loadEntries(groupId, start, until), loadBlackouts(groupId, start, until)]);
  const gameSlugById = new Map([...gameIdBySlug].map(([slug, id]) => [id, slug]));
  const entries = entriesRaw
    .map((e) => ({
      userId: e.user_id as string,
      gameSlug: gameSlugById.get(e.game_id as string),
      puzzleDate: e.puzzle_date as string,
      durationSeconds: e.duration_seconds as number,
      dnf: e.dnf as boolean,
      verified: e.verified as boolean,
    }))
    .filter((e): e is ScoringInput['entries'][number] => e.gameSlug !== undefined); // juego desactivado en el grupo: no cuenta

  const settingsRes = await db.query(`select settings from public.groups where id = $1`, [groupId]);
  const settings = settingsRes.rows[0]?.settings ?? {};

  return scoreTotalTime({
    members: roster.members,
    games: roster.games,
    days,
    entries,
    blackouts,
    settings: { absencePolicy: settings.absence_policy ?? 'penalize', dropWorstN: settings.drop_worst_n ?? 0 },
    today: todayInArgentina(),
  });
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

    if (settings.scoring_mode && settings.scoring_mode !== 'total_time') {
      throw badRequest('SCORING_MODE_NOT_READY', 'El modo "puntos por posición" todavía no está implementado');
    }

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
    const gamesRes = await db.query(`select id, slug from public.games`);
    const gameIdBySlug = new Map<string, string>(gamesRes.rows.map((g) => [g.slug as string, g.id as string]));

    if (clippedEnd < bounds.start) {
      // El período todavía no arrancó en el calendario del grupo (ej. mes que recién empieza mañana): nada que calcular.
      const empty = {
        period: { type: period, startsOn: bounds.start, endsOn: bounds.end, status: 'open' },
        scoringMode: 'total_time',
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
    const rankings = (result?.rankings ?? []).map((ranking) => {
      const yRanking = yResult?.rankings.find((r) => r.gameSlug === ranking.gameSlug);
      const yesterdayRankByUser = new Map((yRanking?.rows ?? []).map((r) => [r.userId, r.rank]));
      const leaderSeconds = ranking.rows.find((r) => r.totalSeconds !== null)?.totalSeconds ?? null;
      const podiumSeconds = ranking.rows.filter((r) => r.totalSeconds !== null)[2]?.totalSeconds ?? leaderSeconds;

      const rows = ranking.rows.map((row) => {
        const yRank = yesterdayRankByUser.get(row.userId) ?? null;
        return {
          ...row,
          deltaVsYesterday: yRank !== null && row.rank !== null ? yRank - row.rank : null,
          gapToLeader: row.totalSeconds !== null && leaderSeconds !== null ? row.totalSeconds - leaderSeconds : null,
          gapToPodium: row.totalSeconds !== null && podiumSeconds !== null ? row.totalSeconds - podiumSeconds : null,
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
      scoringMode: 'total_time',
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
