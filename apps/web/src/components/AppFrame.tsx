import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

/**
 * Marco de las 5 pantallas de primer nivel: contenido scrolleable + barra inferior fija.
 * Las pantallas de detalle (día, perfil, alta/unión de grupo) no llevan este marco —
 * tienen flecha de "volver" en vez de tabs, como en el artboard 04.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ flex: 1 }}>{children}</div>
      <BottomNav />
    </div>
  );
}
