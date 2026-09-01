import { Navigate, Route, Routes } from 'react-router-dom';
import KitchenSink from './pages/KitchenSink';
import Placeholder from './pages/Placeholder';
import Login from './pages/Login';
import Perfil from './pages/Perfil';
import { ProtectedRoute } from './components/ProtectedRoute';

/** Rutas de specs/02-design.md §6.1. Las pantallas reales llegan en las fases 2–8. */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/kitchen-sink" element={<KitchenSink />} />

      <Route path="/" element={<ProtectedRoute><Placeholder title="Hoy" task="T4.8 · artboard 01" /></ProtectedRoute>} />
      <Route path="/cargar" element={<ProtectedRoute><Placeholder title="Cargar tiempos" task="T3.14 · artboard 02" /></ProtectedRoute>} />
      <Route path="/ranking" element={<ProtectedRoute><Placeholder title="Tabla" task="T4.7 · artboard 03" /></ProtectedRoute>} />
      <Route path="/stats" element={<ProtectedRoute><Placeholder title="Mis estadísticas" task="T8.3 · artboard 04" /></ProtectedRoute>} />
      <Route path="/grupo" element={<ProtectedRoute><Placeholder title="Grupo" task="T2.6 · artboard 04" /></ProtectedRoute>} />
      <Route path="/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
      <Route path="/dia/:fecha" element={<ProtectedRoute><Placeholder title="Detalle del día" task="T4.9 · artboard 04" /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
