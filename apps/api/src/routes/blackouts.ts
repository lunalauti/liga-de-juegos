import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { requireAdmin } from '../services/authz.js';
import { invalidateGroupCache } from '../services/leaderboardCache.js';

export const blackoutsRouter = Router();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida, esperado YYYY-MM-DD');

/**
 * D6/T6.5 — "el admin puede marcar un día como anulado para el grupo", para
 * cuando La Nación no publica un juego. `gameSlug: null` anula el día entero
 * (todos los juegos activos); un slug puntual anula sólo ese juego ese día.
 */
const createSchema = z.object({
  puzzleDate: dateSchema,
  gameSlug: z.string().nullable().default(null),
  reason: z.string().trim().max(140).optional(),
});

function serialize(row: Record<string, unknown>) {
  return {
    id: row['id'],
    puzzleDate: row['puzzle_date'],
    gameSlug: row['game_slug'] ?? null,
    reason: row['reason'],
    createdAt: row['created_at'],
  };
}

/** Lista los blackouts vigentes del grupo — la pantalla de ajustes los necesita para poder deshacerlos. */
blackoutsRouter.get('/groups/:id/blackouts', async (req, res, next) => {
  try {
    const groupId = req.params['id']!;
    await requireAdmin(groupId, req.user!.id);
    const r = await db.query(
      `select bd.id, bd.puzzle_date, bd.reason, bd.created_at, g.slug as game_slug
         from public.blackout_dates bd
         left join public.games g on g.id = bd.game_id
        where bd.group_id = $1
        order by bd.puzzle_date desc`,
      [groupId],
    );
    res.json(r.rows.map(serialize));
  } catch (err) {
    next(err);
  }
});

blackoutsRouter.post('/groups/:id/blackouts', async (req, res, next) => {
  try {
    const groupId = req.params['id']!;
    await requireAdmin(groupId, req.user!.id);
    const body = createSchema.parse(req.body);

    let gameId: string | null = null;
    if (body.gameSlug !== null) {
      const gameRow = await db.query(`select id from public.games where slug = $1`, [body.gameSlug]);
      if (gameRow.rows.length === 0) throw badRequest('UNKNOWN_GAME', 'Ese juego no existe en el catálogo');
      gameId = gameRow.rows[0].id;
    }

    // Idempotente: anular un día ya anulado no es un error, es un no-op con el mismo resultado.
    const inserted = await db.query(
      `insert into public.blackout_dates (group_id, puzzle_date, game_id, reason)
       values ($1, $2, $3, $4)
       on conflict do nothing
       returning *`,
      [groupId, body.puzzleDate, gameId, body.reason ?? null],
    );
    const row =
      inserted.rows[0] ??
      (
        await db.query(
          gameId === null
            ? `select * from public.blackout_dates where group_id = $1 and puzzle_date = $2 and game_id is null`
            : `select * from public.blackout_dates where group_id = $1 and puzzle_date = $2 and game_id = $3`,
          gameId === null ? [groupId, body.puzzleDate] : [groupId, body.puzzleDate, gameId],
        )
      ).rows[0];

    // Anular un día cambia la grilla que ve el motor de puntuación (§5.1, paso 1): invalida el ranking cacheado.
    invalidateGroupCache(groupId);

    res.status(201).json(serialize(row));
  } catch (err) {
    next(err);
  }
});

/** Reactivar un día (deshacer el anulado). Idempotente: borrar algo que no existe no es un error. */
blackoutsRouter.delete('/groups/:id/blackouts/:blackoutId', async (req, res, next) => {
  try {
    const groupId = req.params['id']!;
    const blackoutId = req.params['blackoutId']!;
    await requireAdmin(groupId, req.user!.id);

    const existing = await db.query(`select 1 from public.blackout_dates where id = $1 and group_id = $2`, [blackoutId, groupId]);
    if (existing.rows.length === 0) throw notFound('Ese día no está anulado (o ya lo reactivaron)');

    await db.query(`delete from public.blackout_dates where id = $1 and group_id = $2`, [blackoutId, groupId]);
    invalidateGroupCache(groupId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
