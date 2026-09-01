import { Link } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

/** Andamio de la Fase 0: la ruta existe y está protegida, la pantalla llega en su fase. */
export default function Placeholder({ title, task }: { title: string; task: string }) {
  const { session } = useSession();
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '48px 20px' }}>
      <p className="lj-label" style={{ marginBottom: 8 }}>Pendiente · {task}</p>
      <h1 className="lj-display" style={{ fontSize: 40, margin: '0 0 12px' }}>{title}</h1>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: '#4A4438', margin: '0 0 20px' }}>
        Esta pantalla todavía no está construida. Los componentes con los que se arma ya están:
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link className="btn btn-primary" to="/kitchen-sink" style={{ display: 'inline-flex', alignItems: 'center' }}>
          Ver el kitchen sink
        </Link>
        <Link className="btn btn-outline-dark" to="/perfil" style={{ display: 'inline-flex', alignItems: 'center' }}>
          Tu perfil
        </Link>
      </div>
      {session?.user.email && (
        <p style={{ fontSize: 12, color: '#6B6357', marginTop: 16 }}>Conectado como {session.user.email}</p>
      )}
    </div>
  );
}
