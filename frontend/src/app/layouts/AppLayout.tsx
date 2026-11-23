import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { SessionProvider, useSession } from '../../features/auth/session';
import { GoogleFeedback } from '../../features/auth/GoogleAccess';
import { ROLE_LABELS } from '../../shared/lib/format';

const upcoming = [
  ['▤', 'Órdenes de trabajo', 'workOrders.diagnose'],
  ['person', 'Clientes', 'customers.read'],
  ['car', 'Vehículos', 'customers.read'],
  ['document', 'Presupuestos', 'estimates.manage'],
  ['$', 'Liquidaciones y cobros', 'payments.register'],
  ['box', 'Productos y stock', 'inventory.consume'],
];

const iconPaths: Record<string, string | undefined> = {
  person: 'M8 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 14v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1Z',
  car: 'M2.5 11H1V8.5l2-1 2-3h5l2 3 3 1V11h-1.5M5.5 11h5M3 7.5h9M7.5 4.5v3M5.5 11a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM13.5 11a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
  document: 'M3 1h6l4 4v10H3ZM9 1v4h4M5.5 8h5m-5 3h5',
  box: 'M1 4l7-3 7 3v8l-7 3-7-3ZM1 4l7 3 7-3M8 7v8M4.5 2.5l7 3',
};

function MenuIcon({ name }: { name: string }) {
  const path = iconPaths[name];
  return (
    <span className="desktop-menu-icon" aria-hidden="true">
      {path ? (
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d={path} />
        </svg>
      ) : name}
    </span>
  );
}

function Header({ home, showAccount }: { home: boolean; showAccount: boolean }) {
  const { state } = useSession();
  const [accountOpen, setAccountOpen] = useState(false);
  const me = state.status === 'authenticated' ? state.me : null;

  const logoutButton = (
    <Link className="workspace-logout" to="/cerrar-sesion">Cerrar sesión</Link>
  );
  const accountActions = me && (
    <>
      <Link className="workspace-profile" to="/perfil"><strong>{me.user.name}</strong><span className="visually-hidden"> · Mi perfil</span></Link>
      <div>{ROLE_LABELS[me.role]}</div>
    </>
  );
  const settingsLink = me?.permissions.includes('settings.read') && (
    <NavLink to="/configuracion"><MenuIcon name="⚙" /> Configuración</NavLink>
  );

  if (home && me) {
    return (
      <>
        <header className="home-mobile-bar">
          <span className="taller-brand"><span className="taller-symbol" aria-hidden="true">T</span>
            {showAccount ? <span className="mobile-account-brand">Tsgarage<small>{me.workshop.name}</small></span> : me.workshop.name}
          </span>
          <details className="home-mobile-account" onToggle={event => setAccountOpen(event.currentTarget.open)}>
            <summary className="home-role">{ROLE_LABELS[me.role]}</summary>
            {accountOpen && (
              <div className="home-mobile-account-panel">
                <div className="home-account-details">{accountActions}</div>
                {logoutButton}
              </div>
            )}
          </details>
        </header>
        <aside className="home-sidebar">
          <NavLink to="/" className="taller-brand">
            <span className="taller-symbol" aria-hidden="true">T</span>
            <span className="home-brand-name">Tsgarage<small>Espacio de trabajo</small></span>
          </NavLink>
          <div className="home-sidebar-box"><strong>{me.workshop.name}</strong><div>Sucursal única</div></div>
          <nav aria-label="Operación" className="home-desktop-nav">
            <small>Operación</small>
            <NavLink to="/" end><MenuIcon name="⌂" /> Inicio</NavLink>
            {upcoming.filter(([, , permission]) => me.permissions.includes(permission)).map(([icon, label]) => (
              <span className="home-unavailable" aria-disabled="true" key={label}><MenuIcon name={icon} />{label}</span>
            ))}
            {settingsLink}
          </nav>
          <div className="home-sidebar-account">
            <div className="home-sidebar-box">{accountActions}</div>
            {logoutButton}
          </div>
        </aside>
        <nav className="home-mobile-nav" aria-label="Principal">
          <NavLink to="/" end><span aria-hidden="true">⌂</span>Inicio</NavLink>
          <button type="button" disabled><span aria-hidden="true">▤</span>Órdenes</button>
          <button type="button" disabled><span aria-hidden="true">⌕</span>Buscar</button>
          <NavLink to="/mas" end className={showAccount ? 'account-nav-active' : undefined}><span aria-hidden="true">···</span>Más</NavLink>
        </nav>
      </>
    );
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <NavLink to="/" className="taller-brand"><span className="taller-symbol" aria-hidden="true">T</span>{me?.workshop.name ?? 'Taller'}</NavLink>
        {me && (
          <>
            <nav aria-label="Principal">
              <NavLink to="/" end>Inicio</NavLink>
              {settingsLink}
            </nav>
            <div className="account">
              <Link className="workspace-profile" to="/perfil">Mi perfil</Link>
              {logoutButton}
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
      <LayoutContent />
    </SessionProvider>
  );
}

function LayoutContent() {
  const { state } = useSession();
  const { pathname, search } = useLocation();
  const authenticated = state.status === 'authenticated';
  const showAccount = /^\/(perfil|cerrar-sesion)\/?$/i.test(pathname);
  const home = showAccount || pathname === '/' || /^\/(mas|configuracion)\/?$/i.test(pathname);
  return (
    <div className={authenticated ? `workspace-layout${home ? ' workspace-home' : ''}` : undefined}>
      {authenticated && <Header home={home} showAccount={showAccount} />}
      <div className="workspace-content">
        {authenticated && pathname === '/' && new URLSearchParams(search).has('google') && (
          <div className="account-feedback"><GoogleFeedback search={search} /></div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
