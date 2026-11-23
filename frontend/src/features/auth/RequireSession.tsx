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
  if (state.status === 'anonymous') return <Navigate to={state.expired ? '/sesion-vencida' : '/login'} replace state={{ from: location.pathname }} />;
  if ((workshopOwner && state.me.role !== 'OWNER') || (permission && !state.me.permissions.includes(permission))) {
    const settings = permission === 'settings.read';
    return <div className="access-denied">
      <AuthScreen variant="notice" tone="danger" title="Acceso denegado" badge="Permisos"
        description={<>
          <span className="access-denied-desktop">Tu cuenta no tiene permiso para abrir este recurso.</span>
          <span className="access-denied-mobile">{settings ? 'Configuración del taller' : 'Tu cuenta no tiene permiso para abrir este recurso.'}</span>
        </>}>
        {settings && <div className="access-denied-mobile access-denied-panel">
          <Alert tone="error"><strong>Esta sección requiere permisos</strong><p>La persona administradora del taller puede gestionar estos datos.</p></Alert>
        </div>}
        <Link className="button-link primary access-denied-desktop" to="/">Volver al inicio</Link>
        <Link className="button-link primary access-denied-mobile" to="/mas">Volver al menú</Link>
      </AuthScreen>
    </div>;
  }
  return <>{children}</>;
}

export function ExpiredSessionPage() {
  const { state } = useSession();
  const location = useLocation();
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  return <AuthScreen variant="notice" tone="warning" title="Tu sesión venció" badge="Acceso al taller"
    description="Volvé a ingresar para continuar con tu trabajo.">
    <Link className="button-link primary" to="/login" replace state={location.state}>Iniciar sesión</Link>
  </AuthScreen>;
}
