import { Router } from 'express';
import { db } from '../db.js';

export const gamesRouter = Router();

/** Catálogo de juegos disponibles (D5: es data, no un enum). */
gamesRouter.get('/games', async (_req, res, next) => {
  try {
    const r = await db.query(
      `select slug, name, default_penalty_seconds as "defaultPenaltySeconds"
         from public.games where active = true order by sort_order`,
    );
    res.json(r.rows);
  } catch (err) {
    next(err);
  }
});
