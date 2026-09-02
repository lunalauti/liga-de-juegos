import { Router } from 'express';
import { closeExpiredSeasons } from '../services/seasons.js';

export const cronRouter = Router();

/**
 * T7.2 (RF-16) — "cron 00:10 ART: cerrar temporadas vencidas". No hay Cron Jobs
 * en el plan free de Render (RNF-6), así que en vez de un cron real es un
 * endpoint que un cron EXTERNO gratuito golpea una vez al día (mismo patrón que
 * el ping de /health de T5.5, con el mismo cron-job.org). Vive fuera del stack
 * de auth con JWT de Supabase (como /health) porque quien llama no es un
 * usuario logueado — se protege con un secreto compartido en vez de un token.
 */
cronRouter.post('/internal/cron/close-seasons', async (req, res, next) => {
  try {
    const expected = process.env['CRON_SECRET'];
    const given = req.headers['x-cron-secret'];
    if (!expected || given !== expected) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Falta o no coincide x-cron-secret', details: {} } });
      return;
    }
    const result = await closeExpiredSeasons();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});
