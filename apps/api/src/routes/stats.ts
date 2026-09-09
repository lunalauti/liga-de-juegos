import { Router } from 'express';
import { z } from 'zod';
import { todayInArgentina, weekBounds, monthBounds, addDays } from '@liga/shared';
import { db } from '../db.js';
import { notFound } from '../errors.js';
import { requireMember } from '../services/authz.js';
import { computeStats } from '../scoring/stats.js';
import type { StatsEntry } from '../scoring/stats.js';

export const statsRouter = Router();

const querySchema = z.object({ period: z.enum(['week', 'month']).optional() });

/** RF-14, RF-19 — estadísticas personales del que pide, dentro de este grupo. */
statsRouter.get('/groups/:id/stats', async (req, res, next) => {
  try {
    const groupId = req.params['id']!;
    await requireMember(groupId, req.user!.id);
    const query = querySchema.parse(req.query);

    const groupRes = await db.query(`select settings from public.groups where id = $1`, [groupId]);
    if (groupRes.rows.length === 0) throw notFound('Ese grupo no existe');
    const settings = groupRes.rows[0].settings;

    const period = query.period ?? settings.primary_period ?? 'month';
    const today = todayInArgentina();
    const currentPeriod = period === 'week' ? weekBounds(today) : monthBounds(today);
    const previousAnchor = addDays(currentPeriod.start, -1); // último día del período anterior
    const previousPeriod = period === 'week' ? weekBounds(previousAnchor) : monthBounds(previousAnchor);

    const gamesRes = await db.query(
      `select g.slug, g.name
         from public.group_games gg join public.games g on g.id = gg.game_id
        where gg.group_id = $1 and gg.enabled = true
        order by g.sort_order`,
      [groupId],
    );
    const games = gamesRes.rows.map((g) => ({ slug: g.slug as string, name: g.name as string }));

    // Todo el historial del jugador en este grupo — racha y PB son sobre toda la
    // vida, no sólo el período (RF-14: "mejor tiempo histórico").
    const entriesRes = await db.query(
      `select g.slug as game_slug, e.puzzle_date, e.duration_seconds, e.dnf, e.verified
         from public.entries e join public.games g on g.id = e.game_id
        where e.group_id = $1 and e.user_id = $2
        order by e.puzzle_date`,
      [groupId, req.user!.id],
    );
    const entries: StatsEntry[] = entriesRes.rows.map((e) => ({
      gameSlug: e.game_slug,
      puzzleDate: e.puzzle_date,
      durationSeconds: e.duration_seconds,
      dnf: e.dnf,
      verified: e.verified,
    }));

    const stats = computeStats({ games, entries, today, currentPeriod, previousPeriod });

    // PB es GLOBAL por jugador y juego, no por grupo (RF-14 "mejor tiempo histórico
    // por juego" — el índice entries_pb_idx, §3.3, es justamente user_id+game_id,
    // sin group_id): mi récord de Crucigrama es el mismo si juego en dos grupos.
    // computeStats calculó un PB scopeado a este grupo; se pisa acá con el real.
    const pbRes = await db.query(
      `select g.slug, min(e.duration_seconds) as pb
         from public.entries e join public.games g on g.id = e.game_id
        where e.user_id = $1 and e.dnf = false and g.slug = any($2)
        group by g.slug`,
      [req.user!.id, games.map((g) => g.slug)],
    );
    const globalPbBySlug = new Map(pbRes.rows.map((r) => [r.slug as string, Number(r.pb)]));
    for (const g of stats.games) g.personalBest = globalPbBySlug.get(g.gameSlug) ?? null;

    // Evolución a 14 días (T8.3, RF-19): un punto por día activo, por juego, para el gráfico.
    const historyStart = addDays(today, -13);
    const historyEntries = entries.filter((e) => e.puzzleDate >= historyStart && e.puzzleDate <= today);
    const history: { puzzleDate: string; perGame: Record<string, number | null> }[] = [];
    for (let d = historyStart; d <= today; d = addDays(d, 1)) {
      const dayEntries = historyEntries.filter((e) => e.puzzleDate === d);
      history.push({
        puzzleDate: d,
        perGame: Object.fromEntries(games.map((g) => [g.slug, dayEntries.find((e) => e.gameSlug === g.slug && !e.dnf)?.durationSeconds ?? null])),
      });
    }

    res.json({ period: { type: period, startsOn: currentPeriod.start, endsOn: currentPeriod.end }, ...stats, history });
  } catch (err) {
    next(err);
  }
});
