import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { notFound } from '../errors.js';

export const meRouter = Router();

/** RF-2 — perfil + grupos del usuario. */
meRouter.get('/me', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const profileQ = db.query(
      `select id, display_name, avatar, notification_prefs, created_at from public.profiles where id = $1`,
      [userId],
    );
    const groupsQ = db.query(
      `select g.id, g.name, g.invite_code, gm.role
         from public.group_members gm
         join public.groups g on g.id = gm.group_id
        where gm.user_id = $1 and g.archived_at is null
        order by g.name`,
      [userId],
    );
    const [profile, groups] = await Promise.all([profileQ, groupsQ]);
    if (profile.rows.length === 0) throw notFound('No encontramos tu perfil. Probá salir y entrar de nuevo.');

    const p = profile.rows[0];
    res.json({
      id: p.id,
      displayName: p.display_name,
      avatar: p.avatar,
      notificationPrefs: p.notification_prefs,
      createdAt: p.created_at,
      groups: groups.rows.map((g) => ({
        id: g.id,
        name: g.name,
        inviteCode: g.invite_code,
        role: g.role,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const patchMeSchema = z.object({
  displayName: z.string().trim().min(2, 'El nombre necesita al menos 2 caracteres').max(30).optional(),
  avatar: z.string().trim().max(200).optional(),
});

/** RF-2 — editar nombre visible y avatar. */
meRouter.patch('/me', async (req, res, next) => {
  try {
    const body = patchMeSchema.parse(req.body);
    if (Object.keys(body).length === 0) {
      res.status(400).json({ error: { code: 'EMPTY_UPDATE', message: 'No mandaste nada para cambiar', details: {} } });
      return;
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    if (body.displayName !== undefined) {
      values.push(body.displayName);
      sets.push(`display_name = $${values.length}`);
    }
    if (body.avatar !== undefined) {
      values.push(body.avatar);
      sets.push(`avatar = $${values.length}`);
    }
    values.push(req.user!.id);

    const result = await db.query(
      `update public.profiles set ${sets.join(', ')} where id = $${values.length}
       returning id, display_name, avatar, created_at`,
      values,
    );
    if (result.rows.length === 0) throw notFound();

    const p = result.rows[0];
    res.json({ id: p.id, displayName: p.display_name, avatar: p.avatar, createdAt: p.created_at });
  } catch (err) {
    next(err);
  }
});

const notificationPrefsSchema = z
  .object({
    pendingToday: z.boolean().optional(),
    teammateActivity: z.boolean().optional(),
    newMember: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No mandaste ningún aviso para cambiar' });

/**
 * T11.1, RF-22/RF-23/RF-24, D13 — tres avisos independientes, se prenden y
 * apagan por separado. Parcial a propósito (como el PATCH de arriba): mandar
 * sólo `{ teammateActivity: true }` no toca los otros dos.
 * `jsonb_set` en vez de reemplazar la columna entera evita pisar una
 * preferencia que no vino en este PATCH con lo que sea que trajera el default.
 */
meRouter.patch('/me/notification-prefs', async (req, res, next) => {
  try {
    const body = notificationPrefsSchema.parse(req.body);
    const current = await db.query(`select notification_prefs from public.profiles where id = $1`, [req.user!.id]);
    if (current.rows.length === 0) throw notFound();

    const merged = { ...current.rows[0].notification_prefs, ...body };
    const result = await db.query(
      `update public.profiles set notification_prefs = $1 where id = $2 returning notification_prefs`,
      [JSON.stringify(merged), req.user!.id],
    );
    res.json({ notificationPrefs: result.rows[0].notification_prefs });
  } catch (err) {
    next(err);
  }
});
