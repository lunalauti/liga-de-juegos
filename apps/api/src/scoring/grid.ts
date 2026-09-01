import type { Blackout, ScoringEntry, ScoringGame, ScoringMember, AbsencePolicy } from './types.js';

/**
 * Una celda que SUMA a algo. Las ausencias con `absence_policy: "ignore"` y los
 * días anulados (blackout) no generan celda — no hay nada que contar, ni siquiera
 * en cero (specs/02-design.md §5.1, paso 1).
 */
export interface ResolvedCell {
  userId: string;
  gameSlug: string;
  puzzleDate: string;
  seconds: number;
  dnf: boolean;
  verified: boolean;
  /** 'entry' = la persona cargó algo (a tiempo o DNF). 'absence' = no cargó y el grupo penaliza. */
  source: 'entry' | 'absence';
}

function isBlackout(blackouts: Blackout[], puzzleDate: string, gameSlug: string): boolean {
  return blackouts.some((b) => b.puzzleDate === puzzleDate && (b.gameSlug === null || b.gameSlug === gameSlug));
}

/**
 * Expande miembro × juego activo × día en celdas resueltas (RF-8). Pura: nada de
 * fechas implícitas, todo lo que necesita entra por parámetro.
 */
export function buildGrid(params: {
  members: ScoringMember[];
  games: ScoringGame[];
  days: string[];
  entries: ScoringEntry[];
  blackouts: Blackout[];
  absencePolicy: AbsencePolicy;
}): ResolvedCell[] {
  const { members, games, days, entries, blackouts, absencePolicy } = params;

  const byKey = new Map<string, ScoringEntry>();
  for (const e of entries) byKey.set(`${e.userId}|${e.gameSlug}|${e.puzzleDate}`, e);

  const cells: ResolvedCell[] = [];

  for (const member of members) {
    for (const game of games) {
      for (const day of days) {
        if (isBlackout(blackouts, day, game.slug)) continue;

        const entry = byKey.get(`${member.userId}|${game.slug}|${day}`);
        if (entry) {
          cells.push({
            userId: member.userId,
            gameSlug: game.slug,
            puzzleDate: day,
            seconds: entry.dnf ? game.penaltySeconds : entry.durationSeconds,
            dnf: entry.dnf,
            verified: entry.verified,
            source: 'entry',
          });
        } else if (absencePolicy === 'penalize') {
          cells.push({
            userId: member.userId,
            gameSlug: game.slug,
            puzzleDate: day,
            seconds: game.penaltySeconds,
            dnf: true, // una ausencia penalizada cuenta como DNF a todos los efectos (RF-8)
            verified: false,
            source: 'absence',
          });
        }
        // absence_policy 'ignore' y sin entry: no hay celda, no aporta nada (RF-8).
      }
    }
  }

  return cells;
}
