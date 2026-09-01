import { Navigate, Route, Routes } from 'react-router-dom';
import KitchenSink from './pages/KitchenSink';
import Placeholder from './pages/Placeholder';

/** Rutas de specs/02-design.md §6.1. Las pantallas reales llegan en las fases 2–8. */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder title="Hoy" task="T4.8 · artboard 01" />} />
      <Route path="/cargar" element={<Placeholder title="Cargar tiempos" task="T3.14 · artboard 02" />} />
      <Route path="/ranking" element={<Placeholder title="Tabla" task="T4.7 · artboard 03" />} />
      <Route path="/stats" element={<Placeholder title="Mis estadísticas" task="T8.3 · artboard 04" />} />
      <Route path="/grupo" element={<Placeholder title="Grupo" task="T2.6 · artboard 04" />} />
      <Route path="/dia/:fecha" element={<Placeholder title="Detalle del día" task="T4.9 · artboard 04" />} />
      <Route path="/kitchen-sink" element={<KitchenSink />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
