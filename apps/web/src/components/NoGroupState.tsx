import { Link } from 'react-router-dom';

/**
 * Estado compartido de "todavía no tenés grupo" — recién registrado, o el único
 * grupo se archivó. Usado por Home, Ranking y Dia: las tres necesitan un grupo
 * activo para pedir datos, y ninguna puede asumir que ya existe uno.
 */
export function NoGroupState() {
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '20px 20px 32px' }}>
      <p className="lj-label" style={{ margin: '0 0 8px' }}>Liga de Juegos</p>
      <h1 className="lj-display" style={{ fontSize: 34, margin: '10px 0 8px' }}>Todavía no tenés grupo</h1>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: '#4A4438', margin: '0 0 20px' }}>
        Creá uno o pedí el código de invitación de tus amigos para empezar a competir.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link className="btn btn-primary" to="/grupo/nuevo">Crear grupo</Link>
        <Link className="btn btn-outline-dark" to="/unirse">Unirme con un código</Link>
      </div>
    </div>
  );
}
