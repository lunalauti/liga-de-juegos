import { describe, it, expect, vi } from 'vitest';
import { slugWord, generateInviteCode } from './inviteCode.js';

describe('slugWord', () => {
  it('toma la palabra más significativa del nombre, sin el artículo', () => {
    // El caso exacto del diseño (specs/02-design.md §6.5): "Los del crucigrama" → CRUCI-84
    expect(slugWord('Los del crucigrama')).toBe('CRUCI');
  });

  it('ignora tildes y usa mayúsculas', () => {
    expect(slugWord('Rincón')).toBe('RINCO');
  });

  it('se queda con la palabra más larga entre varias válidas', () => {
    expect(slugWord('Sudoku Avanzado')).toBe('AVANZ');
  });

  it('cae a GRUPO si no hay ninguna palabra usable', () => {
    expect(slugWord('La de')).toBe('GRUPO');
  });
});

describe('generateInviteCode', () => {
  it('arma el código como PALABRA-NN', async () => {
    const code = await generateInviteCode('Los del crucigrama', async () => false);
    expect(code).toMatch(/^CRUCI-\d{2}$/);
  });

  it('reintenta ante colisión hasta encontrar uno libre', async () => {
    const taken = new Set(['CRUCI-10', 'CRUCI-11', 'CRUCI-12']);
    const isTaken = vi.fn(async (code: string) => taken.has(code));
    let n = 10;
    vi.spyOn(Math, 'random').mockImplementation(() => (n++ - 10) / 90); // 10,11,12,13...
    const code = await generateInviteCode('Los del crucigrama', isTaken);
    expect(taken.has(code)).toBe(false);
    expect(isTaken.mock.calls.length).toBeGreaterThan(1);
    vi.restoreAllMocks();
  });

  it('si el espacio de 2 dígitos está agotado, cae a 3 dígitos', async () => {
    const isTaken = vi.fn(async (code: string) => /^[A-Z]+-\d{2}$/.test(code));
    const code = await generateInviteCode('Cruci Experto', isTaken);
    expect(code).toMatch(/^EXPER-\d{3}$/);
  });

  it('tira un error legible si no encuentra ningún código libre', async () => {
    await expect(generateInviteCode('Cruci Experto', async () => true)).rejects.toThrow(/no pudimos/i);
  });
});
