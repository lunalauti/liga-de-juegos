/** Tipos del motor de puntuación. Ver specs/02-design.md §5. */

export interface ScoringMember {
  userId: string;
  displayName: string;
  avatar: string | null;
}

export interface ScoringGame {
  slug: string;
  name: string;
  /** Penalización VIGENTE del grupo, no la guardada en el entry (RF-17: recalcula siempre). */
  penaltySeconds: number;
}

export interface ScoringEntry {
  userId: string;
  gameSlug: string;
  puzzleDate: string;
  durationSeconds: number;
  dnf: boolean;
  verified: boolean;
}

/** `gameSlug: null` anula el día entero, no sólo un juego (D6). */
export interface Blackout {
  puzzleDate: string;
  gameSlug: string | null;
}

export type AbsencePolicy = 'penalize' | 'ignore';

export interface ScoringSettings {
  absencePolicy: AbsencePolicy;
  dropWorstN: number;
}

export interface ScoringInput {
  members: ScoringMember[];
  games: ScoringGame[];
  /** Días del período, ascendente, ya recortados a `hoy` si el período sigue abierto. */
  days: string[];
  entries: ScoringEntry[];
  blackouts: Blackout[];
  settings: ScoringSettings;
  /** "Hoy" en ART. Sólo un día anterior a éste puede generar una celda de ausencia (§5.1). */
  today: string;
}

/**
 * Fila del ranking de UN juego (D2, 2026-09-01): ya no hay una fila por jugador con
 * desglose por juego adentro — hay una tabla independiente por juego, y esto es una
 * fila de esa tabla, ya scopeada a ese juego.
 */
export interface LeaderboardRow {
  userId: string;
  displayName: string;
  avatar: string | null;
  /** `null` para quien no participó ni un solo día — no compite, no es "primero" por default. */
  rank: number | null;
  /**
   * `true` cuando esta fila y alguna adyacente comparten exactamente el mismo
   * `totalSeconds`, `dailyWins`, `dnfCount` y `bestSeconds` — un empate real,
   * no resuelto por ninguno de los criterios de RF-15. El orden alfabético
   * decide en qué orden se listan, pero NO las convierte en 1º y 2º: comparten
   * `rank` y el front debe mostrar "Empate", no fingir una diferencia que no
   * existe (pedido explícito del usuario, 2026-09-01).
   */
  tied: boolean;
  totalSeconds: number | null;
  avgSeconds: number | null;
  bestSeconds: number | null;
  daysPlayed: number;
  dnfCount: number;
  dailyWins: number;
  droppedDays: string[];
  verifiedCount: number;
  verifiedTotal: number;
}

/** Ranking completo de un solo juego: podio, orden y desempates propios (RF-11, RF-15). */
export interface GameRanking {
  gameSlug: string;
  gameName: string;
  rows: LeaderboardRow[];
}

export interface DailyWinner {
  puzzleDate: string;
  userId: string;
  seconds: number;
}
