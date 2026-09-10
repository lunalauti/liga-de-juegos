import { Router, type Request } from 'express';
import { todayInArgentina } from '@liga/shared';
import { closeExpiredSeasons } from '../services/seasons.js';
import { findPendingUsers, pendingBodyText } from '../services/notifications.js';
import { subscriptionsForUser, sendToSubscription } from '../services/push.js';
import { db } from '../db.js';

export const cronRouter = Router();

function hasValidCronSecret(req: Request): boolean {
  const expected = process.env['CRON_SECRET'];
  const given = req.headers['x-cron-secret'];
  return !!expected && given === expected;
}

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
    if (!hasValidCronSecret(req)) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Falta o no coincide x-cron-secret', details: {} } });
      return;
    }
    const result = await closeExpiredSeasons();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * T10.6 (RF-22) — "cron 21:00 ART: avisar a quien le falten tiempos hoy".
 * specs/02-design.md §10.4. Mismo patrón exacto que close-seasons de arriba:
 * cron externo, fuera del stack de JWT, protegido por el mismo secreto.
 */
cronRouter.post('/internal/cron/notify-pending', async (req, res, next) => {
  try {
    if (!hasValidCronSecret(req)) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Falta o no coincide x-cron-secret', details: {} } });
      return;
    }

    const puzzleDate = todayInArgentina();
    const allPending = await findPendingUsers(puzzleDate);

    // T11.1/D13 — "tener una suscripción push" ya no implica "querer este
    // aviso puntual": con tres avisos independientes hace falta filtrar
    // también por notification_prefs.pendingToday, no sólo por pending.length.
    let pending = allPending;
    let skippedPrefOff = 0;
    if (allPending.length > 0) {
      const prefsRes = await db.query(
        `select id from public.profiles where id = any($1) and (notification_prefs->>'pendingToday')::boolean is true`,
        [allPending.map((u) => u.userId)],
      );
      const wantsIt = new Set(prefsRes.rows.map((r) => r.id as string));
      pending = allPending.filter((u) => wantsIt.has(u.userId));
      skippedPrefOff = allPending.length - pending.length;
    }

    let notified = 0;
    let skippedAlreadySent = 0;
    let skippedNoSubscription = 0;

    for (const user of pending) {
      // Idempotente (§3.1): si el cron ya corrió hoy para este usuario, no se
      // manda de nuevo — `on conflict do nothing` en vez de un select previo,
      // menos una carrera si el cron se dispara dos veces casi al mismo tiempo.
      const logged = await db.query(
        `insert into public.notification_log (user_id, puzzle_date, kind) values ($1, $2, 'pending_today')
         on conflict do nothing returning user_id`,
        [user.userId, puzzleDate],
      );
      if (logged.rows.length === 0) {
        skippedAlreadySent++;
        continue;
      }

      const subscriptions = await subscriptionsForUser(db, user.userId);
      if (subscriptions.length === 0) {
        skippedNoSubscription++;
        continue;
      }

      const payload = { title: 'Faltan tus tiempos de hoy', body: pendingBodyText(user.gameNames), url: '/cargar' };
      for (const sub of subscriptions) await sendToSubscription(db, sub, payload);
      notified++;
    }

    res.json({ ok: true, puzzleDate, pendingUsers: pending.length, notified, skippedAlreadySent, skippedNoSubscription, skippedPrefOff });
  } catch (err) {
    next(err);
  }
});
