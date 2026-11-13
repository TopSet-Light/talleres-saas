import { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { Alert } from '../../shared/ui/Alert';
import { useSession } from './session';
import { AuthScreen } from './AuthScreen';

/**
 * Comodidad de navegación. La autorización real la aplica la API en cada pedido:
 * ocultar una pantalla no reemplaza esa validación.
 */
export function RequireSession({ permission, workshopOwner, children }: { permission?: string; workshopOwner?: boolean; children: ReactNode }) {
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
  if (state.status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname, expired: state.expired }} />;
  if ((workshopOwner && state.me.role !== 'OWNER') || (permission && !state.me.permissions.includes(permission))) {
    return <AuthScreen title="Acceso denegado" description="Tu rol no permite ver esta sección.">
      <Link className="button-link" to="/">Volver al inicio</Link>
    </AuthScreen>;
  }
  return <>{children}</>;
}
