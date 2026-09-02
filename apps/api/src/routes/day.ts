import { Router } from 'express';
import { z } from 'zod';
import { todayInArgentina } from '@liga/shared';
import { db } from '../db.js';
import { requireMember } from '../services/authz.js';

export const dayRouter = Router();

const querySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

type CellStatus = 'played' | 'dnf' | 'absent' | 'blackout';

/** RF-12, RF-20 — la grilla completa jugador × juego de un día puntual. */
dayRouter.get('/groups/:id/day', async (req, res, next) => {
  try {
    const groupId = req.params['id']!;
    await requireMember(groupId, req.user!.id);
    const { date } = querySchema.parse(req.query);
    const puzzleDate = date ?? todayInArgentina();

    const [membersRes, gamesRes, entriesRes, blackoutsRes] = await Promise.all([
      db.query(
        `select p.id, p.display_name, p.avatar
           from public.group_members gm join public.profiles p on p.id = gm.user_id
          where gm.group_id = $1 order by p.display_name`,
        [groupId],
      ),
      db.query(
        `select g.slug, g.name from public.group_games gg join public.games g on g.id = gg.game_id
          where gg.group_id = $1 and gg.enabled = true order by g.sort_order`,
        [groupId],
      ),
      db.query(
        `select e.user_id, g.slug as game_slug, e.duration_seconds, e.dnf, e.verified
           from public.entries e join public.games g on g.id = e.game_id
          where e.group_id = $1 and e.puzzle_date = $2`,
        [groupId, puzzleDate],
      ),
      db.query(
        `select bd.id, bd.puzzle_date, g.slug as game_slug from public.blackout_dates bd
           left join public.games g on g.id = bd.game_id
          where bd.group_id = $1 and bd.puzzle_date = $2`,
        [groupId, puzzleDate],
      ),
    ]);

    const games: { slug: string; name: string }[] = gamesRes.rows;
    const wholeDayBlackout = blackoutsRes.rows.find((b) => b.game_slug === null) ?? null;
    const blackoutAll = wholeDayBlackout !== null;
    const blackoutGames = new Set(blackoutsRes.rows.map((b) => b.game_slug).filter(Boolean));

    const entryByKey = new Map(entriesRes.rows.map((e) => [`${e.user_id}|${e.game_slug}`, e]));

    const bestPerGame: Record<string, { userId: string; seconds: number } | null> = {};
    for (const g of games) {
      const best = entriesRes.rows
        .filter((e) => e.game_slug === g.slug && !e.dnf)
        .sort((a, b) => a.duration_seconds - b.duration_seconds)[0];
      bestPerGame[g.slug] = best ? { userId: best.user_id, seconds: best.duration_seconds } : null;
    }

    const rows = membersRes.rows.map((m) => {
      const cells: Record<string, { status: CellStatus; seconds: number | null; verified: boolean }> = {};
      for (const g of games) {
        if (blackoutAll || blackoutGames.has(g.slug)) {
          cells[g.slug] = { status: 'blackout', seconds: null, verified: false };
          continue;
        }
        const entry = entryByKey.get(`${m.id}|${g.slug}`);
        cells[g.slug] = entry
          ? { status: entry.dnf ? 'dnf' : 'played', seconds: entry.duration_seconds, verified: entry.verified }
          : { status: 'absent', seconds: null, verified: false };
      }
      return { userId: m.id, displayName: m.display_name, avatar: m.avatar, cells };
    });

    const loadedCount = new Set(entriesRes.rows.map((e) => e.user_id)).size;

    res.json({
      puzzleDate,
      memberCount: membersRes.rows.length,
      loadedCount,
      games,
      rows,
      bestPerGame,
      // D6/T6.5: null si el día no está anulado; si lo está, el id sirve para
      // reactivarlo (DELETE /groups/:id/blackouts/:id) sin una consulta aparte.
      wholeDayBlackoutId: wholeDayBlackout?.id ?? null,
    });
  } catch (err) {
    next(err);
  }
});
