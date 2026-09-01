import { Router } from 'express';
import { z } from 'zod';
import { isFutureDate, isWithinRetroactiveWindow } from '@liga/shared';
import { db } from '../db.js';
import { ApiError, badRequest, conflict } from '../errors.js';
import { getMembership } from '../services/authz.js';
import { fetchLnResult, LnFetchError, type LnResult } from '../services/lanacion.js';
import { upsertEntry, serializeEntry, resolveLnVerification } from '../services/entries.js';

export const entriesImportRouter = Router();

async function loadGroupGameByLn(groupId: string, lnGame: string, lnLevel: string) {
  const r = await db.query(
    `select g.id as game_id, g.slug, g.name, gg.penalty_seconds, gg.enabled
       from public.games g
       join public.group_games gg on gg.game_id = g.id
      where gg.group_id = $1 and g.ln_game = $2 and g.ln_level = $3`,
    [groupId, lnGame, lnLevel],
  );
  return r.rows[0] as
    | { game_id: string; slug: string; name: string; penalty_seconds: number; enabled: boolean }
    | undefined;
}

const importSchema = z.object({
  groupIds: z.array(z.string().uuid()).min(1).max(20),
  url: z.string().min(1),
});

interface Resolved {
  ln: LnResult;
  gameSlug: string;
  gameName: string;
  dnf: boolean;
  verified: boolean;
  bindNewId: boolean;
}

/**
 * Todo lo que se puede saber de un link SIN escribir nada: trae el resultado,
 * valida que no esté usado, el customer, la fecha, el mapeo de juego y calcula si
 * quedaría verificado. Compartido por el preview (sólo lectura) y la confirmación
 * (que además escribe). Ver specs/02-design.md §9.4.
 */
async function resolveImport(actorId: string, url: string): Promise<Resolved> {
  const ln = await fetchLnResult(url);

  const already = await db.query(
    `select ir.imported_at, p.display_name
       from public.imported_results ir
       left join public.profiles p on p.id = ir.user_id
      where ir.external_id = $1`,
    [ln.id],
  );
  if (already.rows.length > 0) {
    // left join a propósito: si quien lo importó borró la cuenta (0005), el link
    // sigue reclamado — "un resultado, una carga" no puede depender de que esa
    // cuenta siga existiendo.
    const who = already.rows[0].display_name ?? 'alguien que ya no está en el grupo';
    const when = already.rows[0].imported_at;
    throw conflict('LINK_ALREADY_USED', `Ese link ya lo cargó ${who}`, { importedBy: who, importedAt: when });
  }

  if (ln.customer !== 'lanacion') throw badRequest('WRONG_CUSTOMER', 'Ese link no es de La Nación');
  if (isFutureDate(ln.date)) throw badRequest('FUTURE_DATE', 'Ese resultado tiene una fecha futura, algo anda mal');
  if (!isWithinRetroactiveWindow(ln.date)) {
    throw badRequest('DATE_TOO_OLD', 'Ese resultado es de hace más de 7 días, no se puede cargar');
  }

  const canonicalGame = await db.query(`select slug, name from public.games where ln_game = $1 and ln_level = $2`, [
    ln.game,
    ln.level,
  ]);
  if (canonicalGame.rows.length === 0) throw badRequest('UNMAPPED_GAME', 'No reconocemos ese juego de La Nación todavía');

  const profile = await db.query(`select lanacion_user_ids from public.profiles where id = $1`, [actorId]);
  const boundIds: string[] = profile.rows[0]?.lanacion_user_ids ?? [];
  const { verified, bindNewId } = resolveLnVerification(boundIds, ln.user_id);

  return {
    ln,
    gameSlug: canonicalGame.rows[0].slug,
    gameName: canonicalGame.rows[0].name,
    dnf: ln.result === 'FAIL',
    verified,
    bindNewId,
  };
}

function handleImportError(err: unknown, next: (e: unknown) => void) {
  if (err instanceof LnFetchError) {
    // LN_UNAVAILABLE / LN_BAD_RESPONSE: no es que el usuario se equivocó, es que
    // el servicio de terceros no contestó — 502, no 400 (specs/02-design.md §9.6).
    const isUpstream = err.code === 'LN_UNAVAILABLE' || err.code === 'LN_BAD_RESPONSE';
    next(new ApiError(isUpstream ? 502 : 400, err.code, err.message));
    return;
  }
  next(err);
}

// ---------------------------------------------------------------------------
// Preview — sólo lectura. Nada de esto escribe en la base (RF-6: primero se
// muestra lo detectado, recién se guarda cuando el jugador confirma).
// ---------------------------------------------------------------------------
entriesImportRouter.post('/entries/import/preview', async (req, res, next) => {
  try {
    const body = importSchema.parse(req.body);
    const actorId = req.user!.id;
    const r = await resolveImport(actorId, body.url);

    const groups = [];
    for (const groupId of body.groupIds) {
      const membership = await getMembership(groupId, actorId);
      if (!membership) {
        groups.push({ groupId, status: 'would_skip_not_member' as const });
        continue;
      }
      const groupGame = await loadGroupGameByLn(groupId, r.ln.game, r.ln.level);
      if (!groupGame || !groupGame.enabled) {
        groups.push({ groupId, status: 'would_skip_game_not_active' as const });
        continue;
      }
      groups.push({
        groupId,
        status: 'would_import' as const,
        plannedDurationSeconds: r.dnf ? groupGame.penalty_seconds : r.ln.seconds,
      });
    }

    res.json({
      externalId: r.ln.id,
      gameSlug: r.gameSlug,
      gameName: r.gameName,
      puzzleDate: r.ln.date,
      lnSeconds: r.ln.seconds,
      dnf: r.dnf,
      verified: r.verified,
      groups,
    });
  } catch (err) {
    handleImportError(err, next);
  }
});

// ---------------------------------------------------------------------------
// Confirmación — acá sí se escribe. RF-6, RF-7, T3.13.
// ---------------------------------------------------------------------------
entriesImportRouter.post('/entries/import', async (req, res, next) => {
  const client = await db.connect();
  try {
    const body = importSchema.parse(req.body);
    const actorId = req.user!.id;
    const r = await resolveImport(actorId, body.url);

    const groupResults: Array<{
      groupId: string;
      status: 'created' | 'updated' | 'skipped_not_member' | 'skipped_game_not_active';
      entry?: ReturnType<typeof serializeEntry>;
    }> = [];

    await client.query('begin');

    if (r.bindNewId) {
      await client.query(
        `update public.profiles set lanacion_user_ids = array_append(lanacion_user_ids, $1) where id = $2`,
        [r.ln.user_id, actorId],
      );
    }

    for (const groupId of body.groupIds) {
      const membership = await getMembership(groupId, actorId);
      if (!membership) {
        groupResults.push({ groupId, status: 'skipped_not_member' });
        continue;
      }
      const groupGame = await loadGroupGameByLn(groupId, r.ln.game, r.ln.level);
      if (!groupGame || !groupGame.enabled) {
        groupResults.push({ groupId, status: 'skipped_game_not_active' });
        continue;
      }

      const wasExisting = await client.query(
        `select 1 from public.entries where group_id = $1 and user_id = $2 and game_id = $3 and puzzle_date = $4`,
        [groupId, actorId, groupGame.game_id, r.ln.date],
      );

      const entry = await upsertEntry(
        client,
        {
          groupId,
          userId: actorId,
          gameId: groupGame.game_id,
          puzzleDate: r.ln.date,
          durationSeconds: r.dnf ? groupGame.penalty_seconds : r.ln.seconds,
          dnf: r.dnf,
          source: 'lanacion_link',
          verified: r.verified,
          externalId: r.ln.id,
          externalUserId: r.ln.user_id,
          externalPayload: r.ln,
        },
        actorId,
      );
      groupResults.push({
        groupId,
        status: wasExisting.rows.length > 0 ? 'updated' : 'created',
        entry: serializeEntry(entry),
      });
    }

    const succeeded = groupResults.some((g) => g.status === 'created' || g.status === 'updated');
    if (!succeeded) {
      await client.query('rollback');
      throw badRequest(
        'IMPORT_NO_TARGET',
        'No pudimos cargar este resultado en ningún grupo. Revisá que el juego esté activo ahí.',
        { groups: groupResults },
      );
    }

    await client.query(`insert into public.imported_results (external_id, user_id, payload) values ($1, $2, $3)`, [
      r.ln.id,
      actorId,
      JSON.stringify(r.ln),
    ]);

    await client.query('commit');

    // El tiempo real (ln.seconds) es el mismo para todos los grupos, pero si dnf=true
    // el segundo que cuenta es la penalización de CADA grupo — puede diferir entre
    // grupos (group_games.penalty_seconds), por eso vive en cada entrada de `groups`,
    // no acá arriba.
    res.status(201).json({
      externalId: r.ln.id,
      gameSlug: r.gameSlug,
      gameName: r.gameName,
      puzzleDate: r.ln.date,
      lnSeconds: r.ln.seconds,
      dnf: r.dnf,
      verified: r.verified,
      groups: groupResults,
    });
  } catch (err) {
    await client.query('rollback').catch(() => {});
    handleImportError(err, next);
  } finally {
    client.release();
  }
});
