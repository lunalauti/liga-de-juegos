import { describe, it, expect } from 'vitest';
import { computeStats } from './stats.js';
import type { StatsEntry, StatsInput } from './stats.js';

const GAMES = [
  { slug: 'crucigrama', name: 'Crucigrama' },
  { slug: 'cruci-experto', name: 'Cruci Experto' },
];

function baseInput(overrides: Partial<StatsInput> = {}): StatsInput {
  return {
    games: GAMES,
    entries: [],
    today: '2026-08-31',
    currentPeriod: { start: '2026-08-01', end: '2026-08-31' },
    previousPeriod: { start: '2026-07-01', end: '2026-07-31' },
    ...overrides,
  };
}

function entry(gameSlug: string, puzzleDate: string, durationSeconds: number, opts: Partial<StatsEntry> = {}): StatsEntry {
  return { gameSlug, puzzleDate, durationSeconds, dnf: false, verified: false, ...opts };
}

describe('computeStats · racha (RF-14, holística, D11)', () => {
  it('cuenta días consecutivos con TODOS los juegos activos, sin DNF', () => {
    const stats = computeStats(
      baseInput({
        entries: [
          ...['2026-08-29', '2026-08-30', '2026-08-31'].flatMap((d) => [entry('crucigrama', d, 300), entry('cruci-experto', d, 600)]),
        ],
      }),
    );
    expect(stats.currentStreak).toBe(3);
  });

  it('un DNF corta la racha igual que no haber cargado', () => {
    const stats = computeStats(
      baseInput({
        entries: [
          entry('crucigrama', '2026-08-30', 300),
          entry('cruci-experto', '2026-08-30', 0, { dnf: true }),
          entry('crucigrama', '2026-08-31', 300),
          entry('cruci-experto', '2026-08-31', 600),
        ],
      }),
    );
    expect(stats.currentStreak).toBe(1); // sólo el 31; el 30 tuvo un DNF
  });

  it('el día en curso (hoy) incompleto NO corta la racha — mismo principio que RF-8', () => {
    const stats = computeStats(
      baseInput({
        today: '2026-09-01',
        entries: [
          entry('crucigrama', '2026-08-30', 300),
          entry('cruci-experto', '2026-08-30', 600),
          entry('crucigrama', '2026-08-31', 300),
          entry('cruci-experto', '2026-08-31', 600),
          // 2026-09-01 (hoy): sólo cargó crucigrama, todavía no cargó cruci-experto.
          entry('crucigrama', '2026-09-01', 250),
        ],
      }),
    );
    // Hoy no está completo, pero no rompe nada: la racha sigue contando desde ayer.
    expect(stats.currentStreak).toBe(2);
  });

  it('si hoy SÍ está completo, suma a la racha', () => {
    const stats = computeStats(
      baseInput({
        today: '2026-09-01',
        entries: [
          entry('crucigrama', '2026-08-31', 300),
          entry('cruci-experto', '2026-08-31', 600),
          entry('crucigrama', '2026-09-01', 250),
          entry('cruci-experto', '2026-09-01', 550),
        ],
      }),
    );
    expect(stats.currentStreak).toBe(2);
  });

  it('sin ninguna carga, la racha es 0', () => {
    const stats = computeStats(baseInput());
    expect(stats.currentStreak).toBe(0);
    expect(stats.bestStreak).toBe(0);
  });

  it('la mejor racha histórica puede ser mayor que la actual', () => {
    const stats = computeStats(
      baseInput({
        today: '2026-08-31',
        entries: [
          // Una racha de 3 en el pasado (25-27), después un DNF, y sólo 1 día activo ahora.
          ...['2026-08-25', '2026-08-26', '2026-08-27'].flatMap((d) => [entry('crucigrama', d, 300), entry('cruci-experto', d, 600)]),
          entry('crucigrama', '2026-08-28', 0, { dnf: true }),
          entry('cruci-experto', '2026-08-28', 600),
          entry('crucigrama', '2026-08-31', 300),
          entry('cruci-experto', '2026-08-31', 600),
        ],
      }),
    );
    expect(stats.currentStreak).toBe(1);
    expect(stats.bestStreak).toBe(3);
  });
});

describe('computeStats · por juego (D2: cada juego con sus propias métricas)', () => {
  it('personalBest es el mínimo histórico, ignora DNF y otros juegos', () => {
    const stats = computeStats(
      baseInput({
        entries: [
          entry('crucigrama', '2026-07-01', 200), // mes anterior, igual cuenta para el histórico
          entry('crucigrama', '2026-08-10', 500),
          entry('crucigrama', '2026-08-11', 0, { dnf: true }), // no cuenta, fue DNF
          entry('cruci-experto', '2026-08-10', 100), // otro juego, no debe mezclarse
        ],
      }),
    );
    const cruci = stats.games.find((g) => g.gameSlug === 'crucigrama')!;
    expect(cruci.personalBest).toBe(200);
    const experto = stats.games.find((g) => g.gameSlug === 'cruci-experto')!;
    expect(experto.personalBest).toBe(100);
  });

  it('sin ningún tiempo no-DNF, personalBest es null', () => {
    const stats = computeStats(baseInput({ entries: [entry('crucigrama', '2026-08-01', 0, { dnf: true })] }));
    expect(stats.games.find((g) => g.gameSlug === 'crucigrama')!.personalBest).toBeNull();
  });

  it('completion: no-DNF de la temporada en curso sobre los días del período', () => {
    const stats = computeStats(
      baseInput({
        currentPeriod: { start: '2026-08-01', end: '2026-08-10' }, // 10 días
        entries: [entry('crucigrama', '2026-08-01', 300), entry('crucigrama', '2026-08-02', 300)],
      }),
    );
    expect(stats.games.find((g) => g.gameSlug === 'crucigrama')!.completion).toBeCloseTo(2 / 10);
  });

  it('trend: promedio de este período menos el anterior, negativo = mejoró', () => {
    const stats = computeStats(
      baseInput({
        entries: [
          entry('crucigrama', '2026-07-05', 400), // anterior: promedio 400
          entry('crucigrama', '2026-08-05', 300), // actual: promedio 300
        ],
      }),
    );
    expect(stats.games.find((g) => g.gameSlug === 'crucigrama')!.trend).toBe(300 - 400);
  });

  it('sin datos en el período anterior, trend es null (no hay con qué comparar)', () => {
    const stats = computeStats(baseInput({ entries: [entry('crucigrama', '2026-08-05', 300)] }));
    expect(stats.games.find((g) => g.gameSlug === 'crucigrama')!.trend).toBeNull();
  });

  it('consistencia: desvío estándar poblacional de los tiempos no-DNF del período', () => {
    const stats = computeStats(
      baseInput({
        entries: [
          entry('crucigrama', '2026-08-01', 200),
          entry('crucigrama', '2026-08-02', 400),
        ],
      }),
    );
    // media 300, desvíos ±100 → desvío estándar poblacional = 100
    expect(stats.games.find((g) => g.gameSlug === 'crucigrama')!.consistency).toBeCloseTo(100);
  });

  it('verifiedCount/verifiedTotal cuentan sobre TODA la historia, no sólo el período', () => {
    const stats = computeStats(
      baseInput({
        entries: [
          entry('crucigrama', '2026-07-01', 300, { verified: true }),
          entry('crucigrama', '2026-08-01', 300, { verified: false }),
        ],
      }),
    );
    const cruci = stats.games.find((g) => g.gameSlug === 'crucigrama')!;
    expect(cruci.verifiedTotal).toBe(2);
    expect(cruci.verifiedCount).toBe(1);
  });
});
