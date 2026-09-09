import { useState } from 'react';

/**
 * Reemplaza el "Cargando…" pelado (pedido del usuario, 2026-09-09): una frase
 * del mundo de los juegos de diario en vez de una genérica de servidor, más una
 * animación — la única señal de espera de todo el sistema, así que se la trató
 * con el mismo cuidado que `rowIn` (design/tokens.md "Movimiento").
 *
 * La frase es al azar por montaje, no rotativa: alcanza para variar entre
 * pantallas sin la complejidad de un intervalo, y nunca cambia a mitad de una
 * espera larga (el cold start del free tier de Render, T5.5).
 */
const PHRASES = [
  'Abriendo el diario de hoy…',
  'Afilando el lápiz…',
  'Buscando la 1 horizontal…',
  'Repartiendo los números del sudoku…',
  'Destapando la lapicera…',
];

export function LoadingState({ compact = false }: { compact?: boolean }) {
  const [phrase] = useState(() => PHRASES[Math.floor(Math.random() * PHRASES.length)]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: compact ? 'flex-start' : 'center',
        gap: 10,
        padding: compact ? '18px 0' : '48px 0',
      }}
    >
      <div className="lj-loader" aria-hidden="true">
        <span className="lj-loader__cell" />
        <span className="lj-loader__cell" />
        <span className="lj-loader__cell" />
        <span className="lj-loader__cell" />
        <span className="lj-loader__cell" />
      </div>
      <p role="status" aria-live="polite" style={{ margin: 0, fontSize: compact ? 12 : 13, color: '#6B6357' }}>
        {phrase}
      </p>
    </div>
  );
}
