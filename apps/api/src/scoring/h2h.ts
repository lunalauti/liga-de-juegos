import { buildGrid, type ResolvedCell } from './grid.js';
import type { GameH2H, H2HRow, ScoringGame, ScoringInput, ScoringMember } from './types.js';

/**
 * Modo `h2h` (RF-13, specs/02-design.md §5.2): "por cada día y juego, registrar el
 * resultado contra cada rival, y mostrar una matriz de cuántas veces le gané a
 * cada uno". Como todo desde D2, es por juego — no hay un H2H combinado que
 * mezcle Crucigrama con Sudoku.
 *
 * Usa la misma grilla que `totalTime`/`positionPoints` (buildGrid): un día cuenta
 * para el H2H sólo si AMBOS jugadores tienen una celda ese día (jugaron, DNF, o
 * ausencia penalizada, según `absence_policy` — igual que el resto del sistema).
 * Empate exacto en segundos no le suma a ninguno de los dos.
 */
export function computeH2H(input: ScoringInput): { games: GameH2H[] } {
  const grid = buildGrid({
    members: input.members,
    games: input.games,
    days: input.days,
    entries: input.entries,
    blackouts: input.blackouts,
    absencePolicy: input.settings.absencePolicy,
    today: input.today,
  });

  const games = input.games.map((game) => computeGameH2H(game, input.members, grid));
  return { games };
}

function computeGameH2H(game: ScoringGame, members: ScoringMember[], grid: ResolvedCell[]): GameH2H {
  const gameCells = grid.filter((c) => c.gameSlug === game.slug);

  const byDay = new Map<string, Map<string, number>>(); // día -> (userId -> segundos)
  for (const c of gameCells) {
    const byUser = byDay.get(c.puzzleDate) ?? new Map<string, number>();
    byUser.set(c.userId, c.seconds);
    byDay.set(c.puzzleDate, byUser);
  }

  // wins[a][b] = cuántas veces a le ganó a b (menos segundos, mismo día). `shared`
  // cuenta días con AMBOS jugando, ganados o no — es lo único que distingue "nunca
  // coincidieron" (sin fila) de "coincidieron y siempre empataron" (fila en 0-0).
  const wins = new Map<string, Map<string, number>>();
  const shared = new Map<string, Set<string>>();
  const bump = (a: string, b: string) => {
    const row = wins.get(a) ?? new Map<string, number>();
    row.set(b, (row.get(b) ?? 0) + 1);
    wins.set(a, row);
  };
  const markShared = (a: string, b: string) => {
    const set = shared.get(a) ?? new Set<string>();
    set.add(b);
    shared.set(a, set);
  };

  for (const [, byUser] of byDay) {
    const entries = [...byUser.entries()];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [userA, secondsA] = entries[i]!;
        const [userB, secondsB] = entries[j]!;
        markShared(userA, userB);
        markShared(userB, userA);
        if (secondsA < secondsB) bump(userA, userB);
        else if (secondsB < secondsA) bump(userB, userA);
        // empate exacto: no suma victoria a ninguno, pero sí quedó "shared".
      }
    }
  }

  const playedByUser = new Set(gameCells.map((c) => c.userId));

  const rows: H2HRow[] = members
    .filter((m) => playedByUser.has(m.userId)) // quien nunca jugó nada de este juego no tiene fila (nada que mostrar)
    .map((member) => {
      const opponents = members.filter((o) => o.userId !== member.userId && shared.get(member.userId)?.has(o.userId));
      const vs = opponents.map((o) => ({
        opponentUserId: o.userId,
        wins: wins.get(member.userId)?.get(o.userId) ?? 0,
        losses: wins.get(o.userId)?.get(member.userId) ?? 0,
      }));
      return { userId: member.userId, displayName: member.displayName, avatar: member.avatar, vs };
    });

  return { gameSlug: game.slug, gameName: game.name, rows };
}
