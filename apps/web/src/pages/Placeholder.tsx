import { Link } from 'react-router-dom';

/** Andamio de la Fase 0: la ruta existe, la pantalla llega en su fase. */
export default function Placeholder({ title, task }: { title: string; task: string }) {
  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '48px 20px' }}>
      <p className="lj-label" style={{ marginBottom: 8 }}>Pendiente · {task}</p>
      <h1 className="lj-display" style={{ fontSize: 40, margin: '0 0 12px' }}>{title}</h1>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: '#4A4438', margin: '0 0 20px' }}>
        Esta pantalla todavía no está construida. Los componentes con los que se arma ya están:
      </p>
      <Link className="btn btn-primary" to="/kitchen-sink" style={{ display: 'inline-flex', alignItems: 'center' }}>
        Ver el kitchen sink
      </Link>
    </div>
  );
}
