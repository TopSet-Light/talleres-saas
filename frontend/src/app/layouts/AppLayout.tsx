import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { SessionProvider, useSession } from '../../features/auth/session';
import { toApiError } from '../../shared/api/http';
import { ROLE_LABELS } from '../../shared/lib/format';
import { Alert } from '../../shared/ui/Alert';

function Header() {
  const { state, logout } = useSession();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const me = state.status === 'authenticated' ? state.me : null;

  async function onLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      // Si el servidor no confirmó el cierre, la sesión sigue abierta: se informa y se puede reintentar.
      setLogoutError(toApiError(error).message);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <NavLink to="/" className="brand">Gestión de talleres</NavLink>
        {me && (
          <>
            <nav aria-label="Principal">
              <NavLink to="/" end>Inicio</NavLink>
              {me.permissions.includes('employees.read') && <NavLink to="/empleados">Empleados</NavLink>}
            </nav>
            <div className="account">
              <span>{me.user.name} · {ROLE_LABELS[me.role]}</span>
              <button type="button" className="secondary" disabled={loggingOut} onClick={() => void onLogout()}>
                {loggingOut ? 'Cerrando…' : 'Cerrar sesión'}
              </button>
            </div>
          </>
        )}
      </div>
      {me && logoutError && (
        <div className="topbar-inner">
          <Alert tone="error">No se cerró la sesión: {logoutError} Volvé a intentar con «Cerrar sesión».</Alert>
        </div>
      )}
    </header>
  );
}

export function AppLayout() {
  return (
    <SessionProvider>
      <Header />
      <Outlet />
    </SessionProvider>
  );
}
