import { describe, it, expect } from 'vitest';
import { consolidatePending, pendingBodyText, type PendingRow } from './notifications.js';

function row(over: Partial<PendingRow>): PendingRow {
  return { userId: 'u1', displayName: 'Lauti', gameSlug: 'crucigrama', gameName: 'Crucigrama', groupId: 'g1', ...over };
}

describe('consolidatePending', () => {
  it('sin filas, no hay nadie pendiente', () => {
    expect(consolidatePending([])).toEqual([]);
  });

  it('un pendiente simple', () => {
    const result = consolidatePending([row({})]);
    expect(result).toEqual([{ userId: 'u1', displayName: 'Lauti', gameNames: ['Crucigrama'] }]);
  });

  it('el mismo usuario pendiente en dos grupos distintos: una sola entrada, no dos', () => {
    const result = consolidatePending([
      row({ groupId: 'g1' }),
      row({ groupId: 'g2', gameSlug: 'sudoku-avanzado', gameName: 'Sudoku Avanzado' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.gameNames).toEqual(['Crucigrama', 'Sudoku Avanzado']);
  });

  it('el mismo juego pendiente en dos grupos: no se duplica el nombre', () => {
    const result = consolidatePending([row({ groupId: 'g1' }), row({ groupId: 'g2' })]);
    expect(result[0]!.gameNames).toEqual(['Crucigrama']);
  });

  it('dos usuarios distintos quedan separados', () => {
    const result = consolidatePending([row({ userId: 'u1' }), row({ userId: 'u2', displayName: 'Solchis' })]);
    expect(result).toHaveLength(2);
  });
});

describe('pendingBodyText', () => {
  it('un solo juego', () => {
    expect(pendingBodyText(['Sudoku Avanzado'])).toBe('Sudoku Avanzado sigue sin cargar.');
  });

  it('dos juegos', () => {
    expect(pendingBodyText(['Crucigrama', 'Sudoku Avanzado'])).toBe('Crucigrama y Sudoku Avanzado siguen sin cargar.');
  });

  it('tres juegos', () => {
    expect(pendingBodyText(['Crucigrama', 'Cruci Experto', 'Sudoku Avanzado'])).toBe(
      'Crucigrama, Cruci Experto y Sudoku Avanzado siguen sin cargar.',
    );
  });
});
