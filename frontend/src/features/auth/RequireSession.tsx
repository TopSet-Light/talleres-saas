import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Alert } from '../../shared/ui/Alert';
import { useSession } from './session';

/**
 * Comodidad de navegación. La autorización real la aplica la API en cada pedido:
 * ocultar una pantalla no reemplaza esa validación.
 */
export function RequireSession({ permission, children }: { permission?: string; children: ReactNode }) {
  const { state, reload } = useSession();
  const location = useLocation();
  if (state.status === 'loading') return <main className="page"><p aria-busy="true">Cargando…</p></main>;
  if (state.status === 'error') {
    return (
      <main className="page">
        <Alert tone="error">{state.message}</Alert>
        <button type="button" onClick={() => void reload()}>Reintentar</button>
      </main>
    );
  }
  if (state.status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (permission && !state.me.permissions.includes(permission)) {
    return <main className="page"><h1>Sin permiso</h1><Alert tone="error">Tu rol no permite ver esta sección.</Alert></main>;
  }
  return <>{children}</>;
}
