import { describe, it, expect } from 'vitest';
import { scoreTotalTime } from './totalTime.js';
import type { ScoringInput } from './types.js';

const GAMES = [
  { slug: 'crucigrama', name: 'Crucigrama', penaltySeconds: 1200 },
  { slug: 'cruci-experto', name: 'Cruci Experto', penaltySeconds: 2400 },
];

function baseInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    members: [
      { userId: 'sofi', displayName: 'Sofi', avatar: null },
      { userId: 'nacho', displayName: 'Nacho', avatar: null },
    ],
    games: GAMES,
    days: ['2026-08-31'],
    entries: [],
    blackouts: [],
    settings: { absencePolicy: 'penalize', dropWorstN: 0 },
    ...overrides,
  };
}

describe('scoreTotalTime · caso base: todos completos', () => {
  it('ordena por tiempo total ascendente y arma per_game', () => {
    const { rows } = scoreTotalTime(
      baseInput({
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 600, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 400, dnf: false, verified: false },
          { userId: 'nacho', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 700, dnf: false, verified: false },
        ],
      }),
    );

    expect(rows.map((r) => r.userId)).toEqual(['sofi', 'nacho']);
    expect(rows[0]).toMatchObject({ rank: 1, totalSeconds: 900, daysPlayed: 1, dnfCount: 0, dailyWins: 1 });
    expect(rows[0]!.perGame['crucigrama']).toMatchObject({ total: 300, best: 300, dnf: 0 });
    expect(rows[1]).toMatchObject({ rank: 2, totalSeconds: 1100, dailyWins: 0 });
  });
});

describe('scoreTotalTime · un DNF', () => {
  it('suma la penalización vigente y cuenta en dnf_count', () => {
    const { rows } = scoreTotalTime(
      baseInput({
        days: ['2026-08-31'],
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 0, dnf: true, verified: false },
        ],
        members: [{ userId: 'sofi', displayName: 'Sofi', avatar: null }],
      }),
    );
    expect(rows[0]).toMatchObject({ totalSeconds: 300 + 2400, dnfCount: 1 });
    expect(rows[0]!.perGame['cruci-experto']).toMatchObject({ dnf: 1, best: null });
  });
});

describe('scoreTotalTime · ausencia', () => {
  const entriesSofiOnly = [
    { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
    { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 600, dnf: false, verified: true },
    // nacho no cargó nada ese día
  ];

  it('con absence_policy "penalize" suma la penalización de cada juego', () => {
    const { rows } = scoreTotalTime(baseInput({ entries: entriesSofiOnly, settings: { absencePolicy: 'penalize', dropWorstN: 0 } }));
    const nacho = rows.find((r) => r.userId === 'nacho')!;
    expect(nacho.totalSeconds).toBe(1200 + 2400);
    expect(nacho.daysPlayed).toBe(0); // no jugó, aunque le sumó penalización
  });

  it('con absence_policy "ignore" no le suma nada y no participa del ranking', () => {
    const { rows } = scoreTotalTime(baseInput({ entries: entriesSofiOnly, settings: { absencePolicy: 'ignore', dropWorstN: 0 } }));
    const nacho = rows.find((r) => r.userId === 'nacho')!;
    expect(nacho.totalSeconds).toBeNull();
    expect(nacho.rank).toBe(2); // aparece último, no desaparece de la tabla
    const sofi = rows.find((r) => r.userId === 'sofi')!;
    expect(sofi.rank).toBe(1);
  });
});

describe('scoreTotalTime · empates, un criterio a la vez (RF-15)', () => {
  it('desempata por victorias diarias', () => {
    const { rows } = scoreTotalTime(
      baseInput({
        days: ['2026-08-30', '2026-08-31'],
        entries: [
          // Mismo total (1000) los dos días sumados, pero Sofi ganó el 30.
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 200, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-30', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 250, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 250, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'cruci-experto', puzzleDate: '2026-08-30', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 100, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 100, dnf: false, verified: true },
        ],
      }),
    );
    const sofi = rows.find((r) => r.userId === 'sofi')!;
    const nacho = rows.find((r) => r.userId === 'nacho')!;
    expect(sofi.totalSeconds).toBe(1000);
    expect(nacho.totalSeconds).toBe(800);
    // Nacho tiene menos tiempo total, así que gana igual — este caso prueba
    // dailyWins en aislado más abajo con totales realmente empatados.
    expect(sofi.dailyWins).toBe(1);
    expect(nacho.dailyWins).toBe(1);
  });

  it('con totales y DNF empatados, gana quien tuvo mejor tiempo individual', () => {
    const { rows } = scoreTotalTime(
      baseInput({
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 400, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 600, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 500, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 500, dnf: false, verified: true },
        ],
      }),
    );
    // Ambos suman 1000, 0 DNF, 1 daily win cada uno (empate exacto) → mejor individual: Sofi (400 < 500).
    expect(rows[0]!.userId).toBe('sofi');
    expect(rows[0]!.totalSeconds).toBe(1000);
    expect(rows[1]!.totalSeconds).toBe(1000);
  });

  it('con total y victorias diarias empatados, gana quien tiene menos DNF', () => {
    const { rows } = scoreTotalTime(
      baseInput({
        entries: [
          // Sofi: DNF en crucigrama (paga 1200, la penalización) + 800 en experto = 2000, 1 DNF.
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 0, dnf: true, verified: false },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 800, dnf: false, verified: true },
          // Nacho: mismo total (2000) pero sin ningún DNF.
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 1200, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 800, dnf: false, verified: true },
        ],
      }),
    );
    expect(rows[0]!.totalSeconds).toBe(2000);
    expect(rows[1]!.totalSeconds).toBe(2000);
    expect(rows[0]!.dailyWins).toBe(rows[1]!.dailyWins); // empatan el día también
    expect(rows.map((r) => r.userId)).toEqual(['nacho', 'sofi']); // Nacho: 0 DNF vs 1
  });

  it('si todo empata, desempata alfabético', () => {
    const { rows } = scoreTotalTime(
      baseInput({
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 500, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 500, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 500, dnf: false, verified: true },
          { userId: 'nacho', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 500, dnf: false, verified: true },
        ],
      }),
    );
    // Todo idéntico entre los dos → alfabético: Nacho antes que Sofi.
    expect(rows.map((r) => r.userId)).toEqual(['nacho', 'sofi']);
  });
});

describe('scoreTotalTime · drop worst', () => {
  it('descarta el peor día y no lo cuenta ni en el total ni en days_played', () => {
    const { rows } = scoreTotalTime(
      baseInput({
        days: ['2026-08-30', '2026-08-31'],
        members: [{ userId: 'sofi', displayName: 'Sofi', avatar: null }],
        settings: { absencePolicy: 'penalize', dropWorstN: 1 },
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-30', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-30', durationSeconds: 2400, dnf: true, verified: false },
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 250, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 350, dnf: false, verified: true },
        ],
      }),
    );
    // 30/8 = 2700 (peor), 31/8 = 600 (mejor) → se descarta el 30.
    expect(rows[0]!.totalSeconds).toBe(600);
    expect(rows[0]!.daysPlayed).toBe(1);
    expect(rows[0]!.dnfCount).toBe(0); // el DNF vivía en el día descartado
    expect(rows[0]!.droppedDays).toEqual(['2026-08-30']);
  });
});

describe('scoreTotalTime · grupo con un solo jugador', () => {
  it('igual arma el ranking, con rank 1 solo', () => {
    const { rows } = scoreTotalTime(
      baseInput({
        members: [{ userId: 'sofi', displayName: 'Sofi', avatar: null }],
        entries: [
          { userId: 'sofi', gameSlug: 'crucigrama', puzzleDate: '2026-08-31', durationSeconds: 300, dnf: false, verified: true },
          { userId: 'sofi', gameSlug: 'cruci-experto', puzzleDate: '2026-08-31', durationSeconds: 600, dnf: false, verified: true },
        ],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rank: 1, totalSeconds: 900, dailyWins: 1 });
  });
});

describe('scoreTotalTime · mes sin datos', () => {
  it('con absence_policy "ignore", nadie tiene un total real — todos quedan sin participar', () => {
    const { rows, dailyWinners } = scoreTotalTime(
      baseInput({ entries: [], settings: { absencePolicy: 'ignore', dropWorstN: 0 } }),
    );
    expect(dailyWinners).toEqual([]);
    for (const row of rows) {
      expect(row.totalSeconds).toBeNull();
      expect(row.rank).not.toBeNull(); // aparecen en la tabla igual, al fondo
    }
    // Sin datos, el orden entre "sin participar" es alfabético.
    expect(rows.map((r) => r.userId)).toEqual(['nacho', 'sofi']);
  });

  it('con absence_policy "penalize" (default), un mes sin datos igual reparte penalización a todos', () => {
    // No es un caso degenerado: bajo "penalize" la inactividad SIEMPRE cuenta
    // (RF-8) — no hay "mes sin datos" libre de consecuencia con esta regla.
    const { rows } = scoreTotalTime(baseInput({ entries: [] }));
    for (const row of rows) {
      expect(row.totalSeconds).toBe(1200 + 2400); // penalización de los dos juegos
      expect(row.daysPlayed).toBe(0); // nunca jugó, aunque le sumó
    }
    // Empate exacto entre los dos → alfabético.
    expect(rows.map((r) => r.userId)).toEqual(['nacho', 'sofi']);
  });
});
