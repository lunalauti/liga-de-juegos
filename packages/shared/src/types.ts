/** Tipos de dominio compartidos entre el front y la API. Ver specs/02-design.md §3. */

export type GameSlug = 'crucigrama' | 'cruci-experto' | 'sudoku-avanzado';
export type PeriodType = 'week' | 'month';
export type EntrySource = 'lanacion_link' | 'manual';
export type MemberRole = 'admin' | 'member';

export interface Game {
  slug: GameSlug;
  name: string;
  shortName: string;
  penaltySeconds: number;
  lnGame: string;
  lnLevel: string;
}

export interface Player {
  id: string;
  displayName: string;
  initials: string;
}

export interface Entry {
  id: string;
  groupId: string;
  userId: string;
  gameSlug: GameSlug;
  puzzleDate: string;
  durationSeconds: number;
  dnf: boolean;
  source: EntrySource;
  verified: boolean;
}

export interface LeaderboardRow {
  player: Player;
  rank: number;
  totalSeconds: number;
  perGame: Partial<Record<GameSlug, number>>;
  daysPlayed: number;
  dnfCount: number;
  dailyWins: number;
  streak: number;
  verified: boolean;
  deltaVsYesterday: number;
}
