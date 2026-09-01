import { Router } from 'express';
import { z } from 'zod';
import { parseTime, TimeParseError } from '@liga/shared';
import { isFutureDate, isWithinRetroactiveWindow, isEntryEditable } from '@liga/shared';
import { db } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { requireMember } from '../services/authz.js';
import { upsertEntry, serializeEntry } from '../services/entries.js';

export const entriesRouter = Router();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

const entryInputSchema = z
  .object({
    gameSlug: z.string().min(1),
    dnf: z.boolean().optional().default(false),
    time: z.string().optional(),
  })
  .refine((d) => d.dnf || !!d.time, { message: 'Falta el tiempo', path: ['time'] });

async function loadGroupGame(groupId: string, gameSlug: string) {
  const r = await db.query(
    `select g.id as game_id, g.slug, g.name, gg.penalty_seconds, gg.enabled
       from public.games g
       join public.group_games gg on gg.game_id = g.id
      where gg.group_id = $1 and g.slug = $2`,
    [groupId, gameSlug],
  );
  return r.rows[0] as
    | { game_id: string; slug: string; name: string; penalty_seconds: number; enabled: boolean }
    | undefined;
}

/**
 * Núcleo de la carga manual (RF-6b, RF-7, RF-9, RF-10), compartido por
 * `POST /entries` y `POST /entries/bulk`. Devuelve el resultado o tira ApiError.
 */
async function writeManualEntry(
  groupId: string,
  actorId: string,
  puzzleDate: string,
  input: z.infer<typeof entryInputSchema>,
) {
  const membership = await requireMember(groupId, actorId);

  if (isFutureDate(puzzleDate)) throw badRequest('FUTURE_DATE', 'No podés cargar un resultado de una fecha futura');
  if (!isWithinRetroactiveWindow(puzzleDate)) {
    throw badRequest('DATE_TOO_OLD', 'Sólo se puede cargar hasta 7 días atrás');
  }

  const groupGame = await loadGroupGame(groupId, input.gameSlug);
  if (!groupGame || !groupGame.enabled) {
    throw badRequest('GAME_NOT_ACTIVE', 'Ese juego no está activo en este grupo');
  }

  let durationSeconds: number;
  let dnf = input.dnf;
  let autoConvertedToDnf = false;

  if (dnf) {
    durationSeconds = groupGame.penalty_seconds;
  } else {
    try {
      durationSeconds = parseTime(input.time!);
    } catch (e) {
      throw badRequest('INVALID_TIME', e instanceof TimeParseError ? e.message : 'Tiempo inválido');
    }
    // RF-6b: un tiempo peor que la penalización se carga como DNF, no aporta nada peor.
    if (durationSeconds > groupGame.penalty_seconds) {
      durationSeconds = groupGame.penalty_seconds;
      dnf = true;
      autoConvertedToDnf = true;
    }
  }

  const existing = await db.query(
    `select id from public.entries where group_id = $1 and user_id = $2 and game_id = $3 and puzzle_date = $4`,
    [groupId, actorId, groupGame.game_id, puzzleDate],
  );
  if (existing.rows.length > 0) {
    const groupSettings = await db.query(`select settings from public.groups where id = $1`, [groupId]);
    const editWindowHours = groupSettings.rows[0]?.settings?.edit_window_hours ?? 48;
    if (membership.role !== 'admin' && !isEntryEditable(puzzleDate, editWindowHours)) {
      throw conflict('EDIT_WINDOW_CLOSED', 'Ya pasaron 48 h. Pedile al admin que lo edite.');
    }
  }

  const entry = await upsertEntry(
    db,
    {
      groupId,
      userId: actorId,
      gameId: groupGame.game_id,
      puzzleDate,
      durationSeconds,
      dnf,
      source: 'manual',
      verified: false, // cargar a mano siempre queda sin verificar, incluso si pisa un import (specs §9.5)
    },
    actorId,
  );

  return { entry: serializeEntry(entry), gameSlug: groupGame.slug, autoConvertedToDnf };
}

// ---------------------------------------------------------------------------
// RF-6b — upsert manual de un resultado
// ---------------------------------------------------------------------------
const postEntrySchema = z.object({
  groupId: z.string().uuid(),
  puzzleDate: dateSchema,
}).and(entryInputSchema);

entriesRouter.post('/entries', async (req, res, next) => {
  try {
    const body = postEntrySchema.parse(req.body);
    const result = await writeManualEntry(body.groupId, req.user!.id, body.puzzleDate, body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// RNF-2 — los 3 juegos (y opcionalmente varios grupos) en un solo request
// ---------------------------------------------------------------------------
const bulkEntrySchema = z.object({
  groupIds: z.array(z.string().uuid()).min(1).max(20),
  puzzleDate: dateSchema,
  entries: z.array(entryInputSchema).min(1).max(10),
});

entriesRouter.post('/entries/bulk', async (req, res, next) => {
  try {
    const body = bulkEntrySchema.parse(req.body);
    const results: Array<{
      groupId: string;
      gameSlug: string;
      status: 'ok' | 'error';
      entry?: ReturnType<typeof serializeEntry>;
      autoConvertedToDnf?: boolean;
      error?: { code: string; message: string };
    }> = [];

    for (const groupId of body.groupIds) {
      for (const input of body.entries) {
        try {
          const r = await writeManualEntry(groupId, req.user!.id, body.puzzleDate, input);
          results.push({ groupId, gameSlug: r.gameSlug, status: 'ok', entry: r.entry, autoConvertedToDnf: r.autoConvertedToDnf });
        } catch (e) {
          const err = e as { code?: string; message?: string };
          results.push({
            groupId,
            gameSlug: input.gameSlug,
            status: 'error',
            error: { code: err.code ?? 'UNKNOWN', message: err.message ?? 'No se pudo guardar' },
          });
        }
      }
    }

    res.status(200).json({ results });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// RF-9 — borrar dentro de la ventana de edición
// ---------------------------------------------------------------------------
entriesRouter.delete('/entries/:id', async (req, res, next) => {
  try {
    const entryId = req.params['id']!;
    const found = await db.query(`select * from public.entries where id = $1`, [entryId]);
    if (found.rows.length === 0) throw notFound('Ese resultado no existe');
    const entry = found.rows[0];

    const membership = await requireMember(entry.group_id, req.user!.id);
    const isOwner = entry.user_id === req.user!.id;
    if (!isOwner && membership.role !== 'admin') throw forbidden('No podés borrar el resultado de otra persona');

    // El admin borra lo que sea, siempre. El dueño, sólo dentro de la ventana de edición.
    if (membership.role !== 'admin') {
      const groupSettings = await db.query(`select settings from public.groups where id = $1`, [entry.group_id]);
      const editWindowHours = groupSettings.rows[0]?.settings?.edit_window_hours ?? 48;
      if (!isEntryEditable(entry.puzzle_date, editWindowHours)) {
        throw conflict('EDIT_WINDOW_CLOSED', 'Ya pasaron 48 h. Pedile al admin que lo borre.');
      }
    }

    await db.query(
      `insert into public.entry_audit (entry_id, actor_id, action, before, after) values ($1, $2, 'delete', $3, null)`,
      [entry.id, req.user!.id, entry],
    );
    await db.query(`delete from public.entries where id = $1`, [entryId]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export { writeManualEntry };
