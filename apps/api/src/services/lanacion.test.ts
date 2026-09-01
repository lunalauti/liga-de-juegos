import { describe, it, expect } from 'vitest';
import { extractLnId, fetchLnResult, LnFetchError } from './lanacion.js';

describe('extractLnId', () => {
  it('extrae el uuid de una URL completa', () => {
    expect(extractLnId('https://lanacion.agilmenteapp.com/shared/d11707e8-7916-4699-913c-becac7f971a4')).toBe(
      'd11707e8-7916-4699-913c-becac7f971a4',
    );
  });

  it('acepta el id pelado', () => {
    expect(extractLnId('D11707E8-7916-4699-913C-BECAC7F971A4')).toBe('d11707e8-7916-4699-913c-becac7f971a4');
  });

  it('acepta el id con basura alrededor (pegado con espacios, etc.)', () => {
    expect(extractLnId('  mirá esto: d11707e8-7916-4699-913c-becac7f971a4 ¿lo viste?')).toBe(
      'd11707e8-7916-4699-913c-becac7f971a4',
    );
  });

  it('rechaza texto sin un uuid', () => {
    expect(() => extractLnId('esto no es un link')).toThrow(LnFetchError);
  });
});

/**
 * T3.17 — Test de contrato contra la API real de La Nación. No es parte de la
 * suite normal (red + servicio de terceros): correr con RUN_LN_CONTRACT_TEST=1.
 * Pensado para correr a diario en CI y avisar si La Nación cambia el formato
 * (specs/02-design.md §9.6). Usa un link real ya conocido y estable.
 */
const KNOWN_REAL_ID = 'd11707e8-7916-4699-913c-becac7f971a4';
const runContractTest = process.env['RUN_LN_CONTRACT_TEST'] === '1';

describe.runIf(runContractTest)('contrato con la API de La Nación (red real)', () => {
  it('devuelve la forma esperada para un resultado conocido', async () => {
    const r = await fetchLnResult(KNOWN_REAL_ID);
    expect(r.id).toBe(KNOWN_REAL_ID);
    expect(r.customer).toBe('lanacion');
    expect(r.game).toBe('crossword');
    expect(r.level).toBe('expert');
    expect(typeof r.seconds).toBe('number');
    expect(['SUCCESS', 'FAIL']).toContain(r.result);
    expect(typeof r.user_id).toBe('string');
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
