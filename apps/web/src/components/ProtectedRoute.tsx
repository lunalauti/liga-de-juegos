import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

/** Redirige a /login si no hay sesión. Rutas protegidas: specs/02-design.md §6.1. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const location = useLocation();

  if (loading) return null; // el flash es peor que nada; la sesión se resuelve rápido
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
