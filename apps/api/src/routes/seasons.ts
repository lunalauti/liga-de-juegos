import { Router } from 'express';
import { db } from '../db.js';
import { requireMember } from '../services/authz.js';
import { computePalmares } from '../services/seasons.js';

export const seasonsRouter = Router();

/** RF-16 — historial de temporadas cerradas + la que está en curso (T7.1), y el palmarés (T7.3). */
seasonsRouter.get('/groups/:id/seasons', async (req, res, next) => {
  try {
    const groupId = req.params['id']!;
    await requireMember(groupId, req.user!.id);

    const r = await db.query(
      `select id, period_type, starts_on, ends_on, status, final_standings
         from public.seasons
        where group_id = $1
        order by starts_on desc`,
      [groupId],
    );

    const seasons = r.rows.map((s) => ({
      id: s.id,
      periodType: s.period_type,
      startsOn: s.starts_on,
      endsOn: s.ends_on,
      status: s.status,
      finalStandings: s.final_standings ?? null,
    }));

    const palmares = computePalmares(
      r.rows.map((s) => ({ status: s.status, finalStandings: s.final_standings ?? null })),
    );

    res.json({ seasons, palmares });
  } catch (err) {
    next(err);
  }
});
