import type { Game } from './types.js';

/** Catálogo por defecto. En producción vive en la tabla `games` (specs/02-design.md §9.2). */
export const GAMES: Game[] = [
  { slug: 'crucigrama',      name: 'Crucigrama',      shortName: 'Cruci', penaltySeconds: 1200, lnGame: 'crossword', lnLevel: 'daily' },
  { slug: 'cruci-experto',   name: 'Cruci Experto',   shortName: 'Exp.',  penaltySeconds: 2400, lnGame: 'crossword', lnLevel: 'expert' },
  { slug: 'sudoku-avanzado', name: 'Sudoku Avanzado', shortName: 'Sud.',  penaltySeconds: 2700, lnGame: 'sudoku',    lnLevel: 'hard' },
];
