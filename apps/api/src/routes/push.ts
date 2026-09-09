import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { upsertSubscription, deleteSubscription } from '../services/push.js';

export const pushRouter = Router();

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** T10.2, RF-22 — registra la suscripción push de ESTE navegador para el usuario logueado. */
pushRouter.post('/push/subscribe', async (req, res, next) => {
  try {
    const body = subscribeSchema.parse(req.body);
    await upsertSubscription(db, req.user!.id, body);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

/** Da de baja una suscripción puntual — no todas las del usuario, sólo la de este navegador. */
pushRouter.delete('/push/subscribe', async (req, res, next) => {
  try {
    const body = unsubscribeSchema.parse(req.body);
    await deleteSubscription(db, req.user!.id, body.endpoint);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
