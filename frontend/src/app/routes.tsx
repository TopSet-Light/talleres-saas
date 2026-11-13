import { Link, RouteObject } from 'react-router';
import { App } from '../App';
import { AcceptInvitationPage } from '../features/auth/pages/AcceptInvitationPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { RecoveryPage } from '../features/auth/pages/RecoveryPage';
import { WorkshopSettingsPage } from '../features/auth/pages/WorkshopSettingsPage';
import { CompleteRegistrationPage } from '../features/auth/pages/CompleteRegistrationPage';
import { RequireSession } from '../features/auth/RequireSession';
import { EmployeesPage } from '../features/users/pages/EmployeesPage';
import { AppLayout } from './layouts/AppLayout';
import { HomePage } from './pages/HomePage';
import { MorePage } from './pages/MorePage';

function NotFound() {
  return <main className="page"><h1>Página no encontrada</h1><p><Link to="/">Volver al inicio</Link></p></main>;
}

export const routes: RouteObject[] = [{
  element: <AppLayout />,
  children: [
    { index: true, element: <RequireSession><HomePage /></RequireSession> },
    { path: 'mas', element: <RequireSession><MorePage /></RequireSession> },
    { path: 'empleados', element: <RequireSession permission="employees.read"><EmployeesPage /></RequireSession> },
    { path: 'configuracion', element: <RequireSession workshopOwner><WorkshopSettingsPage /></RequireSession> },
    { path: 'login', element: <LoginPage /> },
    { path: 'registro', element: <RegisterPage /> },
    // Destino del enlace del email de registro: allí se elige la contraseña.
    { path: 'verificar-email', element: <CompleteRegistrationPage /> },
    { path: 'invitacion', element: <AcceptInvitationPage /> },
    { path: 'recuperar-contrasena', element: <RecoveryPage /> },
    { path: 'restablecer-contrasena', element: <RecoveryPage reset /> },
    // Control de salud de la primera entrega, ahora en su propia ruta pública.
    { path: 'estado', element: <App /> },
    { path: '*', element: <NotFound /> },
  ],
}];
