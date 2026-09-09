import { describe, it, expect } from 'vitest';
import { resolveLnVerification } from './entries.js';

// T3.13, reescrito por completo el 2026-09-09: el diseño original ligaba el
// `lanacion_user_id` del primer link al perfil y marcaba "no verificado"
// cualquier link posterior con un id distinto — asumiendo que ese id era
// estable por persona. Con datos reales de producción (3 personas, una
// semana) se confirmó que NO lo es: La Nación devuelve un id distinto en
// CADA link, hasta para la misma persona el día siguiente. Resultado: todo
// import quedaba "no verificado" después del primero, siempre — el chip
// "Verificado" estaba roto para todo el mundo. Ahora todo link verificado
// resuelto contra el servidor de La Nación queda verificado, sin excepción
// — la garantía real es la unicidad global de `external_id` (nadie más
// puede reclamar el mismo link), no este id que resultó no servir para nada.
describe('resolveLnVerification (T3.13)', () => {
  it('todo resultado importado por link queda verificado', () => {
    expect(resolveLnVerification()).toEqual({ verified: true });
  });
});
