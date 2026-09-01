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

export interface PerGameStats {
  total: number;
  avg: number;
  best: number | null;
  dnf: number;
}

export interface LeaderboardRow {
  userId: string;
  displayName: string;
  avatar: string | null;
  /** `null` para quien no participó ni un solo día — no compite, no es "primero" por default. */
  rank: number | null;
  totalSeconds: number | null;
  perGame: Record<string, PerGameStats>;
  daysPlayed: number;
  dnfCount: number;
  dailyWins: number;
  droppedDays: string[];
  verifiedCount: number;
  verifiedTotal: number;
}

export interface DailyWinner {
  puzzleDate: string;
  userId: string;
  totalSeconds: number;
}
