import { Navigate, Route, Routes } from 'react-router-dom';
import KitchenSink from './pages/KitchenSink';
import Placeholder from './pages/Placeholder';
import Login from './pages/Login';
import Perfil from './pages/Perfil';
import Grupo from './pages/Grupo';
import GroupNew from './pages/GroupNew';
import GroupJoin from './pages/GroupJoin';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppFrame } from './components/AppFrame';

/** Rutas de specs/02-design.md §6.1. Las 5 pantallas de tabs llevan AppFrame (barra inferior). */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/kitchen-sink" element={<KitchenSink />} />

      <Route
        path="/"
        element={<ProtectedRoute><AppFrame><Placeholder title="Hoy" task="T4.8 · artboard 01" /></AppFrame></ProtectedRoute>}
      />
      <Route
        path="/cargar"
        element={<ProtectedRoute><AppFrame><Placeholder title="Cargar tiempos" task="T3.14 · artboard 02" /></AppFrame></ProtectedRoute>}
      />
      <Route
        path="/ranking"
        element={<ProtectedRoute><AppFrame><Placeholder title="Tabla" task="T4.7 · artboard 03" /></AppFrame></ProtectedRoute>}
      />
      <Route
        path="/stats"
        element={<ProtectedRoute><AppFrame><Placeholder title="Mis estadísticas" task="T8.3 · artboard 04" /></AppFrame></ProtectedRoute>}
      />
      <Route path="/grupo" element={<ProtectedRoute><AppFrame><Grupo /></AppFrame></ProtectedRoute>} />

      <Route path="/grupo/nuevo" element={<ProtectedRoute><GroupNew /></ProtectedRoute>} />
      <Route path="/unirse" element={<ProtectedRoute><GroupJoin /></ProtectedRoute>} />
      <Route path="/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
      <Route
        path="/dia/:fecha"
        element={<ProtectedRoute><Placeholder title="Detalle del día" task="T4.9 · artboard 04" /></ProtectedRoute>}
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
