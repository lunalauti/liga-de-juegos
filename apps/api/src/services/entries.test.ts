import { describe, it, expect } from 'vitest';
import { resolveLnVerification } from './entries.js';

describe('resolveLnVerification (T3.13)', () => {
  it('el primer link liga la identidad y queda verificado', () => {
    expect(resolveLnVerification([], 'lanacion-111')).toEqual({ verified: true, bindNewId: true });
  });

  it('un link con el mismo user_id ya ligado queda verificado', () => {
    expect(resolveLnVerification(['lanacion-111'], 'lanacion-111')).toEqual({ verified: true, bindNewId: false });
  });

  it('un link con un user_id distinto al ligado queda sin verificar', () => {
    expect(resolveLnVerification(['lanacion-111'], 'lanacion-222')).toEqual({ verified: false, bindNewId: false });
  });

  it('funciona con varios ids ligados (cuenta compartida entre dispositivos)', () => {
    expect(resolveLnVerification(['lanacion-111', 'lanacion-222'], 'lanacion-222')).toEqual({ verified: true, bindNewId: false });
  });
});
