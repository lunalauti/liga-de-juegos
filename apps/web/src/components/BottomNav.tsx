import { NavLink } from 'react-router-dom';

/**
 * Barra inferior de 5 tabs, calcada del artboard 06 / patrón repetido en 01-05
 * (specs/02-design.md §6.1). El activo lleva el borde superior de 3px y color primary.
 */
const TABS = [
  { to: '/', label: 'Hoy', icon: '▦', end: true },
  { to: '/cargar', label: 'Cargar', icon: '＋' },
  { to: '/ranking', label: 'Tabla', icon: '≡' },
  { to: '/stats', label: 'Yo', icon: '◔' },
  { to: '/grupo', label: 'Grupo', icon: '◍' },
] as const;

export function BottomNav() {
  return (
    <nav
      aria-label="Navegación principal"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        borderTop: '1.5px solid #14120E',
        background: '#F1EBDD',
        flex: '0 0 64px',
      }}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={'end' in tab ? tab.end : false}
          style={({ isActive }) => ({
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            color: isActive ? '#16513C' : '#6B6357',
            borderTop: isActive ? '3px solid #16513C' : '3px solid transparent',
            marginTop: -1.5,
            textDecoration: 'none',
          })}
        >
          {({ isActive }) => (
            <>
              <span aria-hidden="true" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: isActive ? 600 : 400 }}>
                {tab.icon}
              </span>
              <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400 }}>{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
