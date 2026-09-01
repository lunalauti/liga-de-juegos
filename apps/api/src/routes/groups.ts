import { Router } from 'express';
import { z } from 'zod';
import { groupSettingsPatchSchema, groupSettingsSchema, defaultGroupSettings, type GroupSettings } from '@liga/shared';
import { db } from '../db.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { generateInviteCode } from '../services/inviteCode.js';
import { getMembership, requireMember, requireAdmin } from '../services/authz.js';

export const groupsRouter = Router();

function serializeGroup(
  group: Record<string, unknown>,
  members: { id: string; display_name: string; avatar: string | null; role: string; joined_at: string }[],
  games: { slug: string; name: string; penalty_seconds: number; enabled: boolean }[],
) {
  return {
    id: group['id'],
    name: group['name'],
    inviteCode: group['invite_code'],
    createdAt: group['created_at'],
    archivedAt: group['archived_at'],
    settings: group['settings'],
    members: members.map((m) => ({
      userId: m.id,
      displayName: m.display_name,
      avatar: m.avatar,
      role: m.role,
      joinedAt: m.joined_at,
    })),
    games: games.map((g) => ({ slug: g.slug, name: g.name, penaltySeconds: g.penalty_seconds, enabled: g.enabled })),
  };
}

async function loadGroupDetail(groupId: string) {
  const [groupRes, membersRes, gamesRes] = await Promise.all([
    db.query(`select * from public.groups where id = $1`, [groupId]),
    db.query(
      `select p.id, p.display_name, p.avatar, gm.role, gm.joined_at
         from public.group_members gm
         join public.profiles p on p.id = gm.user_id
        where gm.group_id = $1
        order by (gm.role = 'admin') desc, gm.joined_at`,
      [groupId],
    ),
    db.query(
      `select g.slug, g.name, gg.penalty_seconds, gg.enabled
         from public.group_games gg
         join public.games g on g.id = gg.game_id
        where gg.group_id = $1
        order by g.sort_order`,
      [groupId],
    ),
  ]);
  if (groupRes.rows.length === 0) return null;
  return serializeGroup(groupRes.rows[0], membersRes.rows, gamesRes.rows);
}

// ---------------------------------------------------------------------------
// RF-3 — crear grupo
// ---------------------------------------------------------------------------
const createGroupSchema = z.object({ name: z.string().trim().min(2, 'El nombre necesita al menos 2 caracteres').max(60) });

groupsRouter.post('/groups', async (req, res, next) => {
  const client = await db.connect();
  try {
    const { name } = createGroupSchema.parse(req.body);

    const inviteCode = await generateInviteCode(name, async (code) => {
      const r = await client.query(`select 1 from public.groups where invite_code = $1`, [code]);
      return (r.rowCount ?? 0) > 0;
    });

    await client.query('begin');
    const groupRes = await client.query(
      `insert into public.groups (name, invite_code, created_by, settings)
       values ($1, $2, $3, $4) returning *`,
      [name, inviteCode, req.user!.id, JSON.stringify(defaultGroupSettings)],
    );
    const group = groupRes.rows[0];

    await client.query(
      `insert into public.group_members (group_id, user_id, role) values ($1, $2, 'admin')`,
      [group.id, req.user!.id],
    );

    // Arrancan todos los juegos activos del catálogo; el admin ajusta el subconjunto después (RF-5).
    const games = await client.query(`select id, default_penalty_seconds from public.games where active = true`);
    for (const g of games.rows) {
      await client.query(
        `insert into public.group_games (group_id, game_id, penalty_seconds, enabled) values ($1, $2, $3, true)`,
        [group.id, g.id, g.default_penalty_seconds],
      );
    }
    await client.query('commit');

    const detail = await loadGroupDetail(group.id);
    res.status(201).json(detail);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// RF-4 — unirse con código. Idempotente: si ya sos miembro, no es un error.
// ---------------------------------------------------------------------------
const joinGroupSchema = z.object({ code: z.string().trim().min(3).max(20) });

groupsRouter.post('/groups/join', async (req, res, next) => {
  try {
    const { code } = joinGroupSchema.parse(req.body);
    const normalized = code.toUpperCase();

    const groupRes = await db.query(`select * from public.groups where invite_code = $1`, [normalized]);
    if (groupRes.rows.length === 0) throw notFound('Ese código no existe. Revisalo con quien te lo pasó.');
    const group = groupRes.rows[0];
    if (group.archived_at) throw conflict('GROUP_ARCHIVED', 'Este grupo está archivado y ya no acepta miembros nuevos');

    const existing = await getMembership(group.id, req.user!.id);
    if (!existing) {
      await db.query(
        `insert into public.group_members (group_id, user_id, role) values ($1, $2, 'member')`,
        [group.id, req.user!.id],
      );
    }

    const detail = await loadGroupDetail(group.id);
    res.status(existing ? 200 : 201).json(detail);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// RF-5 — detalle del grupo
// ---------------------------------------------------------------------------
groupsRouter.get('/groups/:id', async (req, res, next) => {
  try {
    await requireMember(req.params['id']!, req.user!.id);
    const detail = await loadGroupDetail(req.params['id']!);
    if (!detail) throw notFound('Ese grupo no existe');
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// RF-5 / RF-17 — editar grupo: nombre, archivar, settings, juegos activos
// ---------------------------------------------------------------------------
const gamePatchSchema = z.object({
  slug: z.string(),
  enabled: z.boolean().optional(),
  penaltySeconds: z.number().int().min(60).max(24 * 3600).optional(),
});

const patchGroupSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  archived: z.boolean().optional(),
  settings: groupSettingsPatchSchema.optional(),
  games: z.array(gamePatchSchema).max(20).optional(),
});

groupsRouter.patch('/groups/:id', async (req, res, next) => {
  try {
    const groupId = req.params['id']!;
    await requireAdmin(groupId, req.user!.id);
    const body = patchGroupSchema.parse(req.body);

    if (body.name !== undefined) {
      await db.query(`update public.groups set name = $1 where id = $2`, [body.name, groupId]);
    }

    if (body.archived !== undefined) {
      await db.query(`update public.groups set archived_at = $1 where id = $2`, [
        body.archived ? new Date().toISOString() : null,
        groupId,
      ]);
    }

    if (body.settings !== undefined) {
      const current = await db.query(`select settings from public.groups where id = $1`, [groupId]);
      const merged = { ...(current.rows[0]?.settings as GroupSettings), ...body.settings };
      const parsed = groupSettingsSchema.safeParse(merged);
      if (!parsed.success) {
        throw badRequest('INVALID_SETTINGS', 'Esa combinación de reglas no es válida', { issues: parsed.error.issues });
      }
      // RF-17: cambiar la configuración recalcula la temporada en curso — el motor de
      // puntuación (Fase 4) calcula on-read, así que no hay nada más que hacer acá.
      await db.query(`update public.groups set settings = $1 where id = $2`, [JSON.stringify(parsed.data), groupId]);
    }

    if (body.games !== undefined) {
      for (const g of body.games) {
        const gameRow = await db.query(`select id from public.games where slug = $1`, [g.slug]);
        if (gameRow.rows.length === 0) continue;
        const gameId = gameRow.rows[0].id;
        await db.query(
          `insert into public.group_games (group_id, game_id, penalty_seconds, enabled)
           values ($1, $2, coalesce($3, (select default_penalty_seconds from public.games where id = $2)), coalesce($4, true))
           on conflict (group_id, game_id) do update set
             enabled = coalesce(excluded.enabled, public.group_games.enabled),
             penalty_seconds = coalesce($3, public.group_games.penalty_seconds)`,
          [groupId, gameId, g.penaltySeconds ?? null, g.enabled ?? null],
        );
      }
    }

    const detail = await loadGroupDetail(groupId);
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// RF-5 — regenerar código
// ---------------------------------------------------------------------------
groupsRouter.post('/groups/:id/regenerate-code', async (req, res, next) => {
  try {
    const groupId = req.params['id']!;
    await requireAdmin(groupId, req.user!.id);

    const groupRes = await db.query(`select name from public.groups where id = $1`, [groupId]);
    if (groupRes.rows.length === 0) throw notFound('Ese grupo no existe');

    const inviteCode = await generateInviteCode(groupRes.rows[0].name, async (code) => {
      const r = await db.query(`select 1 from public.groups where invite_code = $1`, [code]);
      return (r.rowCount ?? 0) > 0;
    });
    await db.query(`update public.groups set invite_code = $1 where id = $2`, [inviteCode, groupId]);
    res.json({ inviteCode });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// RF-5 — remover miembro, con el resguardo de no dejar el grupo sin admin
// ---------------------------------------------------------------------------
groupsRouter.delete('/groups/:id/members/:userId', async (req, res, next) => {
  try {
    const groupId = req.params['id']!;
    const targetId = req.params['userId']!;
    await requireAdmin(groupId, req.user!.id);

    const target = await getMembership(groupId, targetId);
    if (!target) throw notFound('Esa persona no es parte de este grupo');

    if (target.role === 'admin') {
      const admins = await db.query(
        `select count(*)::int as n from public.group_members where group_id = $1 and role = 'admin'`,
        [groupId],
      );
      if (admins.rows[0].n <= 1) {
        throw conflict('LAST_ADMIN', 'No podés remover al único admin. Hacé admin a otra persona primero.');
      }
    }

    await db.query(`delete from public.group_members where group_id = $1 and user_id = $2`, [groupId, targetId]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
