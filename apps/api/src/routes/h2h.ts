import { Router } from 'express';
import { z } from 'zod';
import { todayInArgentina, weekBounds, monthBounds } from '@liga/shared';
import { notFound } from '../errors.js';
import { requireMember } from '../services/authz.js';
import { loadRoster, loadGameIdBySlug, loadScoringInput } from '../services/scoringData.js';
import { computeH2H } from '../scoring/h2h.js';
import { db } from '../db.js';

export const h2hRouter = Router();

const querySchema = z.object({
  period: z.enum(['week', 'month']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** RF-13, §5.2 — matriz cabeza a cabeza, una por juego activo, del período pedido. */
h2hRouter.get('/groups/:id/h2h', async (req, res, next) => {
  try {
    const groupId = req.params['id']!;
    await requireMember(groupId, req.user!.id);
    const query = querySchema.parse(req.query);

    const groupRes = await db.query(`select settings from public.groups where id = $1`, [groupId]);
    if (groupRes.rows.length === 0) throw notFound('Ese grupo no existe');
    const settings = groupRes.rows[0].settings;

    const period = query.period ?? settings.primary_period ?? 'month';
    const anchor = query.date ?? todayInArgentina();
    const today = todayInArgentina();
    const bounds = period === 'week' ? weekBounds(anchor) : monthBounds(anchor);
    const clippedEnd = bounds.end < today ? bounds.end : today;

    const roster = await loadRoster(groupId);
    const gameIdBySlug = await loadGameIdBySlug();

    if (clippedEnd < bounds.start) {
      res.json({
        period: { type: period, startsOn: bounds.start, endsOn: bounds.end },
        games: roster.games.map((g) => ({ gameSlug: g.slug, gameName: g.name, rows: [] })),
      });
      return;
    }

    const input = await loadScoringInput(groupId, roster, gameIdBySlug, bounds.start, clippedEnd);
    const result = input ? computeH2H(input) : { games: roster.games.map((g) => ({ gameSlug: g.slug, gameName: g.name, rows: [] })) };

    res.json({
      period: { type: period, startsOn: bounds.start, endsOn: bounds.end },
      games: result.games,
    });
  } catch (err) {
    next(err);
  }
});
