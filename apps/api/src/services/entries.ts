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
  const wasCreated = before.rows.length === 0;
  await client.query(
    `insert into public.entry_audit (entry_id, actor_id, action, before, after) values ($1, $2, $3, $4, $5)`,
    [entry.id, actorId, wasCreated ? 'create' : 'update', before.rows[0] ?? null, entry],
  );

  // T7.1/RF-16: garantiza que exista una `season` abierta para el período de este
  // resultado — sin esto, T7.2 no tendría nada que cerrar cuando el período termine.
  await ensureOpenSeasons(client, write.groupId, write.puzzleDate);

  // No es una columna de la tabla — es información que ya tenemos acá (antes
  // vs. después del upsert) y que el caller necesita para decidir si dispara
  // el aviso de RF-23 (T11.3): sólo la primera carga avisa, nunca una edición.
  entry.was_created = wasCreated;
  return entry;
}

/**
 * T8.4/RF-14 — "destacar el récord personal cuando alguien lo rompe". PB es
 * GLOBAL por jugador y juego, no por grupo (mismo criterio que `entries_pb_idx`,
 * §3.3, y `scoring/stats.ts`): llamar DESPUÉS de escribir la entry, así el propio
 * resultado ya está incluido en el mínimo. Un DNF nunca es récord.
 */
export async function isNewPersonalBest(
  client: Pool | PoolClient,
  userId: string,
  gameId: string,
  durationSeconds: number,
  dnf: boolean,
): Promise<boolean> {
  if (dnf) return false;
  const r = await client.query(
    `select min(duration_seconds) as pb from public.entries where user_id = $1 and game_id = $2 and dnf = false`,
    [userId, gameId],
  );
  const pb = r.rows[0]?.pb;
  return pb !== null && pb !== undefined && Number(pb) === durationSeconds;
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
 * T3.13 — decide si un resultado importado queda verificado. Bug real
 * encontrado el 2026-09-09 (reportado por el usuario: "cargué con el link y
 * me sigue apareciendo A mano"): el diseño original (D7/RF-6) asumía que
 * `ln.user_id` era un identificador ESTABLE de la cuenta de La Nación de la
 * persona — se guardaba el primero que aparecía y se marcaba "no verificado"
 * apenas un link posterior traía uno distinto. Con datos reales de varios
 * días (3 personas, una semana) se confirmó que NO es estable: La Nación
 * devuelve un id distinto en CADA link compartido, hasta para la misma
 * persona el día siguiente. Con esa lógica, todo resultado importado quedaba
 * "no verificado" después del primero, siempre — el chip "Verificado" estaba
 * roto para todo el mundo desde que se implementó, en silencio.
 *
 * La verificación real no depende de este id: viene de que el link resuelve
 * a un resultado inmutable en el servidor de La Nación (no se puede inventar
 * un tiempo) y de que `imported_results.external_id` es único globalmente
 * (nadie más puede reclamar el mismo link — esa sí es una garantía real,
 * §9.6). Por eso ahora todo resultado importado por link queda verificado,
 * siempre — se dejó de ligar `lanacion_user_id` al perfil (crecía sin límite
 * en cada import, prácticamente uno distinto por vez, sin decidir nada).
 */
export function resolveLnVerification(): { verified: true } {
  return { verified: true };
}
