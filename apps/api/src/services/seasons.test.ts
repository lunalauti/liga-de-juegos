import { describe, it, expect } from 'vitest';
import { computePalmares } from './seasons.js';

function closedSeason(rankings: { gameSlug: string; gameName: string; rows: { userId: string; displayName: string; rank: number | null }[] }[]) {
  return { status: 'closed', finalStandings: { rankings } };
}

describe('computePalmares · T7.3', () => {
  it('cuenta un título por juego a quien fue rank 1', () => {
    const seasons = [
      closedSeason([{ gameSlug: 'crucigrama', gameName: 'Crucigrama', rows: [{ userId: 'sofi', displayName: 'Sofi', rank: 1 }] }]),
    ];
    expect(computePalmares(seasons)).toEqual([{ gameSlug: 'crucigrama', leaders: [{ userId: 'sofi', displayName: 'Sofi', titles: 1 }] }]);
  });

  it('acumula títulos de varias temporadas cerradas', () => {
    const seasons = [
      closedSeason([{ gameSlug: 'crucigrama', gameName: 'Crucigrama', rows: [{ userId: 'sofi', displayName: 'Sofi', rank: 1 }] }]),
      closedSeason([{ gameSlug: 'crucigrama', gameName: 'Crucigrama', rows: [{ userId: 'sofi', displayName: 'Sofi', rank: 1 }] }]),
      closedSeason([{ gameSlug: 'crucigrama', gameName: 'Crucigrama', rows: [{ userId: 'nacho', displayName: 'Nacho', rank: 1 }] }]),
    ];
    expect(computePalmares(seasons)).toEqual([
      {
        gameSlug: 'crucigrama',
        leaders: [
          { userId: 'sofi', displayName: 'Sofi', titles: 2 },
          { userId: 'nacho', displayName: 'Nacho', titles: 1 },
        ],
      },
    ]);
  });

  it('un empate por el 1º puesto (T4b.8) cuenta como título para los dos', () => {
    const seasons = [
      closedSeason([
        {
          gameSlug: 'crucigrama',
          gameName: 'Crucigrama',
          rows: [
            { userId: 'sofi', displayName: 'Sofi', rank: 1 },
            { userId: 'nacho', displayName: 'Nacho', rank: 1 },
          ],
        },
      ]),
    ];
    const palmares = computePalmares(seasons);
    expect(palmares[0]!.leaders).toHaveLength(2);
    expect(palmares[0]!.leaders.every((l) => l.titles === 1)).toBe(true);
  });

  it('ignora temporadas abiertas (todavía no tienen final_standings de verdad)', () => {
    const seasons = [{ status: 'open', finalStandings: null }];
    expect(computePalmares(seasons)).toEqual([]);
  });

  it('cada juego tiene su propio palmarés, sin mezclar (D2)', () => {
    const seasons = [
      closedSeason([
        { gameSlug: 'crucigrama', gameName: 'Crucigrama', rows: [{ userId: 'sofi', displayName: 'Sofi', rank: 1 }] },
        { gameSlug: 'sudoku-avanzado', gameName: 'Sudoku Avanzado', rows: [{ userId: 'nacho', displayName: 'Nacho', rank: 1 }] },
      ]),
    ];
    const palmares = computePalmares(seasons);
    expect(palmares.find((p) => p.gameSlug === 'crucigrama')!.leaders[0]!.userId).toBe('sofi');
    expect(palmares.find((p) => p.gameSlug === 'sudoku-avanzado')!.leaders[0]!.userId).toBe('nacho');
  });
});
