import { NavLink, Outlet, useNavigate } from 'react-router';
import { SessionProvider, useSession } from '../../features/auth/session';
import { ROLE_LABELS } from '../../shared/lib/format';

function Header() {
  const { state, logout } = useSession();
  const navigate = useNavigate();
  const me = state.status === 'authenticated' ? state.me : null;
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
              <button type="button" className="secondary" onClick={() => void logout().then(() => navigate('/login', { replace: true }))}>
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
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
