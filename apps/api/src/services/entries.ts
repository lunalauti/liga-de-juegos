import type { Pool, PoolClient } from 'pg';
import { ensureOpenSeasons } from './seasons.js';

export interface EntryWrite {
  groupId: string;
  userId: string;
  gameId: string;
  puzzleDate: string;
  durationSeconds: number;
  dnf: boolean;
  source: 'manual' | 'lanacion_link';
  verified: boolean;
  externalId?: string | null;
  externalUserId?: string | null;
  externalPayload?: unknown;
}

/**
 * Upsert de un resultado + log de auditoría, en una sola función usada tanto por
 * la carga manual como por la importación de La Nación (specs/02-design.md §3.1, RF-9).
 * `client` puede ser el pool o una conexión ya abierta con una transacción en curso.
 */
export async function upsertEntry(client: Pool | PoolClient, write: EntryWrite, actorId: string) {
  const before = await client.query(
    `select * from public.entries where group_id = $1 and user_id = $2 and game_id = $3 and puzzle_date = $4`,
    [write.groupId, write.userId, write.gameId, write.puzzleDate],
  );

  const after = await client.query(
    `insert into public.entries
       (group_id, user_id, game_id, puzzle_date, duration_seconds, dnf, source, verified,
        external_id, external_user_id, external_payload)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (group_id, user_id, game_id, puzzle_date) do update set
       duration_seconds = excluded.duration_seconds,
       dnf = excluded.dnf,
       source = excluded.source,
       verified = excluded.verified,
       external_id = excluded.external_id,
       external_user_id = excluded.external_user_id,
       external_payload = excluded.external_payload,
       updated_at = now()
     returning *`,
    [
      write.groupId,
      write.userId,
      write.gameId,
      write.puzzleDate,
      write.durationSeconds,
      write.dnf,
      write.source,
      write.verified,
      write.externalId ?? null,
      write.externalUserId ?? null,
      write.externalPayload ? JSON.stringify(write.externalPayload) : null,
    ],
  );

  const entry = after.rows[0];
  await client.query(
    `insert into public.entry_audit (entry_id, actor_id, action, before, after) values ($1, $2, $3, $4, $5)`,
    [entry.id, actorId, before.rows.length ? 'update' : 'create', before.rows[0] ?? null, entry],
  );

  // T7.1/RF-16: garantiza que exista una `season` abierta para el período de este
  // resultado — sin esto, T7.2 no tendría nada que cerrar cuando el período termine.
  await ensureOpenSeasons(client, write.groupId, write.puzzleDate);

  return entry;
}

export function serializeEntry(e: Record<string, unknown>) {
  return {
    id: e['id'],
    groupId: e['group_id'],
    userId: e['user_id'],
    gameId: e['game_id'],
    puzzleDate: e['puzzle_date'],
    durationSeconds: e['duration_seconds'],
    dnf: e['dnf'],
    source: e['source'],
    verified: e['verified'],
    createdAt: e['created_at'],
    updatedAt: e['updated_at'],
  };
}

/**
 * T3.13 — decide si un resultado importado queda verificado, y si hay que ligar
 * el identificador de La Nación al perfil. Extraída como función pura para poder
 * testear los tres casos (primer link, coincide, no coincide) sin red ni base.
 */
export function resolveLnVerification(
  boundIds: string[],
  lnUserId: string,
): { verified: boolean; bindNewId: boolean } {
  if (boundIds.length === 0) return { verified: true, bindNewId: true };
  return { verified: boundIds.includes(lnUserId), bindNewId: false };
}
