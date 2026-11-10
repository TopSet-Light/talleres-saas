import { Link, RouteObject } from 'react-router';
import { App } from '../App';
import { AcceptInvitationPage } from '../features/auth/pages/AcceptInvitationPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { CompleteRegistrationPage } from '../features/auth/pages/CompleteRegistrationPage';
import { RequireSession } from '../features/auth/RequireSession';
import { useMe } from '../features/auth/session';
import { EmployeesPage } from '../features/users/pages/EmployeesPage';
import { ROLE_LABELS } from '../shared/lib/format';
import { AppLayout } from './layouts/AppLayout';

function HomePage() {
  const me = useMe();
  if (!me) return null;
  return (
    <main className="page">
      <p className="eyebrow">{me.workshop.name.toUpperCase()}</p>
      <h1>Hola, {me.user.name}</h1>
      <p>Ingresaste como <strong>{ROLE_LABELS[me.role]}</strong>. Los módulos de clientes, vehículos y órdenes llegan en las próximas entregas.</p>
      {me.permissions.includes('employees.read') && <p><Link to="/empleados">Gestionar empleados</Link></p>}
    </main>
  );
}

function NotFound() {
  return <main className="page"><h1>Página no encontrada</h1><p><Link to="/">Volver al inicio</Link></p></main>;
}

export const routes: RouteObject[] = [{
  element: <AppLayout />,
  children: [
    { index: true, element: <RequireSession><HomePage /></RequireSession> },
    { path: 'empleados', element: <RequireSession permission="employees.read"><EmployeesPage /></RequireSession> },
    { path: 'login', element: <LoginPage /> },
    { path: 'registro', element: <RegisterPage /> },
    // Destino del enlace del email de registro: allí se elige la contraseña.
    { path: 'verificar-email', element: <CompleteRegistrationPage /> },
    { path: 'invitacion', element: <AcceptInvitationPage /> },
    // Control de salud de la primera entrega, ahora en su propia ruta pública.
    { path: 'estado', element: <App /> },
    { path: '*', element: <NotFound /> },
  ],
}];
