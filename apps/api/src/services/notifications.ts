import { db } from '../db.js';

/**
 * T10.5, specs/02-design.md §10.4 — RF-22 "faltan tus tiempos de hoy". Quiénes
 * tienen al menos un juego activo pendiente hoy, consolidado por usuario (uno
 * puede estar en más de un grupo — se avisa una sola vez, no uno por grupo).
 */
export interface PendingRow {
  userId: string;
  displayName: string;
  gameSlug: string;
  gameName: string;
  groupId: string;
}

export interface PendingUser {
  userId: string;
  displayName: string;
  /** Nombres de juego, deduplicados — puede venir del mismo juego pendiente en más de un grupo. */
  gameNames: string[];
}

/**
 * Una sola query para TODOS los grupos a la vez (el cron corre una vez al día
 * para toda la app, no conviene un N+1 por grupo). "Pendiente" = juego activo,
 * no anulado (blackout_dates, D6), sin entry ese día — ni jugado ni DNF; un
 * DNF ya es una decisión tomada, no es "pendiente".
 */
export async function fetchPendingRows(puzzleDate: string): Promise<PendingRow[]> {
  const r = await db.query(
    `select gm.user_id, p.display_name, g.slug as game_slug, g.name as game_name, gg.group_id
       from public.group_members gm
       join public.profiles p on p.id = gm.user_id
       join public.group_games gg on gg.group_id = gm.group_id and gg.enabled = true
       join public.games g on g.id = gg.game_id
       left join public.entries e
         on e.group_id = gg.group_id and e.user_id = gm.user_id and e.game_id = gg.game_id and e.puzzle_date = $1
       left join public.blackout_dates bd_all
         on bd_all.group_id = gg.group_id and bd_all.puzzle_date = $1 and bd_all.game_id is null
       left join public.blackout_dates bd_game
         on bd_game.group_id = gg.group_id and bd_game.puzzle_date = $1 and bd_game.game_id = g.id
      where e.id is null and bd_all.id is null and bd_game.id is null`,
    [puzzleDate],
  );
  return r.rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    gameSlug: row.game_slug,
    gameName: row.game_name,
    groupId: row.group_id,
  }));
}

/** Pura — separada de la query para poder testear la consolidación sin Supabase. */
export function consolidatePending(rows: PendingRow[]): PendingUser[] {
  const byUser = new Map<string, PendingUser>();
  for (const row of rows) {
    const existing = byUser.get(row.userId);
    if (existing) {
      if (!existing.gameNames.includes(row.gameName)) existing.gameNames.push(row.gameName);
    } else {
      byUser.set(row.userId, { userId: row.userId, displayName: row.displayName, gameNames: [row.gameName] });
    }
  }
  return [...byUser.values()];
}

export async function findPendingUsers(puzzleDate: string): Promise<PendingUser[]> {
  return consolidatePending(await fetchPendingRows(puzzleDate));
}

/** "Sudoku Avanzado sigue sin cargar." / "Crucigrama y Sudoku Avanzado siguen sin cargar." (§10.5) */
export function pendingBodyText(gameNames: string[]): string {
  if (gameNames.length === 1) return `${gameNames[0]} sigue sin cargar.`;
  const allButLast = gameNames.slice(0, -1).join(', ');
  return `${allButLast} y ${gameNames[gameNames.length - 1]} siguen sin cargar.`;
}
