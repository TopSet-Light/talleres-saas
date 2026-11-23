import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { anonymous, calls, json, mockApi, owner, renderAt, TOKEN } from '../../test-utils';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const registration = {
  workshopName: 'Taller ficticio Norte', ownerName: 'Dueña Norte', email: 'duena@example.invalid', expiresAt: '2026-11-11T12:00:00.000Z',
};

it('abre Más como pantalla y reserva el acceso a Configuración para el dueño', async () => {
  mockApi({ 'GET /api/auth/me': () => json(200, { ...owner, role: 'RECEPTION', permissions: ['customers.read'] }) });
  const router = renderAt('/');
  fireEvent.click(await screen.findByRole('link', { name: 'Más' }));
  expect(await screen.findByRole('heading', { name: 'Más' })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/mas');
  expect(screen.getByRole('link', { name: 'Más' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('Configuración').closest('[aria-disabled]')).toHaveAttribute('aria-disabled', 'true');
  expect(screen.queryByRole('link', { name: /Configuración/ })).not.toBeInTheDocument();
});

it('sin sesión redirige al login', async () => {
  mockApi({ 'GET /api/auth/me': anonymous });
  const router = renderAt('/');
  expect(await screen.findByRole('heading', { name: 'Ingresá a tu taller' })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/login');
});

it('inicia sesión y muestra el taller y el menú del dueño', async () => {
  const fetchMock = mockApi({ 'GET /api/auth/me': anonymous, 'POST /api/auth/login': () => json(200, owner) });
  renderAt('/login');
  await screen.findByRole('heading', { name: 'Ingresá a tu taller' });
  fill('Email', 'duena@example.invalid');
  fill('Contraseña', 'contraseña de prueba');
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
expect(screen.queryByRole('link', { name: 'Empleados' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Configuración' }));
  expect(await screen.findByRole('link', { name: 'Equipo y accesos' })).toHaveAttribute('href', '/empleados');
  expect(calls(fetchMock, 'POST /api/auth/login')).toEqual([{ email: 'duena@example.invalid', password: 'contraseña de prueba' }]);
});

it('muestra el error genérico del login', async () => {
  mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/auth/login': () => json(401, { code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos.' }),
  });
  renderAt('/login');
  await screen.findByRole('heading', { name: 'Ingresá a tu taller' });
  fill('Email', 'duena@example.invalid');
  fill('Contraseña', 'x');
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  expect(await screen.findByText('Email o contraseña incorrectos.')).toBeInTheDocument();
});

it('registro: pide solo los datos del taller, muestra errores de la API y luego pide revisar el email', async () => {
  let attempt = 0;
  const fetchMock = mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/auth/register': () => (++attempt === 1
      ? json(400, { code: 'VALIDATION_ERROR', message: 'Revisá los datos ingresados.', fields: { email: 'Ingresá un email válido.' } })
      : json(202, { message: 'ok' })),
  });
  renderAt('/registro');
  await screen.findByRole('heading', { name: 'Registrá tu taller' });
  expect(screen.queryByLabelText(/Contraseña/)).not.toBeInTheDocument();
  fill('Nombre comercial', 'Taller ficticio');
  fill('Nombre del responsable', 'Persona');
  fill('Teléfono de contacto', '+54 11 5555-0123');
  fill('Localidad o ciudad del taller', 'Buenos Aires');
  fill('Dirección', 'Calle de prueba 123');
  fill('Email', 'persona');
  fireEvent.click(screen.getByRole('button', { name: 'Crear taller' }));
  expect(await screen.findByText('Ingresá un email válido.')).toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');

  fill('Email', 'persona@example.invalid');
  fireEvent.click(screen.getByRole('button', { name: 'Crear taller' }));
  expect(await screen.findByRole('heading', { name: 'Revisá tu correo' })).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/register')[1]).toEqual({
    workshopName: 'Taller ficticio', ownerName: 'Persona', email: 'persona@example.invalid',
    contactPhone: '+54 11 5555-0123', locality: 'Buenos Aires', address: 'Calle de prueba 123',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reenviar email' }));
  expect(calls(fetchMock, 'POST /api/auth/register')[2]).toEqual(calls(fetchMock, 'POST /api/auth/register')[1]);
  expect(await screen.findByRole('button', { name: 'Reenviar email' })).toBeEnabled();
});

it('el enlace del email muestra el registro y permite elegir la contraseña', async () => {
  const fetchMock = mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/auth/registration/preview': () => json(200, registration),
    'POST /api/auth/registration/complete': () => json(201, { message: 'Registro completo. Ya podés iniciar sesión.' }),
  });
  renderAt(`/verificar-email#token=${TOKEN}`);
  expect(await screen.findByText('Taller ficticio Norte')).toBeInTheDocument();
  expect(screen.getByText('duena@example.invalid')).toBeInTheDocument();
  fill('Elegí tu contraseña', 'contraseña de prueba');
  fill('Repetí la contraseña', 'otra contraseña');
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/registration/complete')).toHaveLength(0);

  fill('Repetí la contraseña', 'contraseña de prueba');
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  expect(await screen.findByText('Registro completo. Ya podés iniciar sesión.')).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/registration/complete')).toEqual([{ token: TOKEN, password: 'contraseña de prueba' }]);
});

it('si el email ya tiene cuenta, ofrece iniciar sesión', async () => {
  mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/auth/registration/preview': () => json(200, registration),
    'POST /api/auth/registration/complete': () => json(409, { code: 'ALREADY_REGISTERED', message: 'Ese email ya tiene una cuenta. Iniciá sesión.' }),
  });
  renderAt(`/verificar-email#token=${TOKEN}`);
  await screen.findByText('Taller ficticio Norte');
  fill('Elegí tu contraseña', 'contraseña de prueba');
  fill('Repetí la contraseña', 'contraseña de prueba');
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
  expect(await screen.findByText('Ese email ya tiene una cuenta. Iniciá sesión.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toBeInTheDocument();
});

it('un enlace sin token o vencido muestra el error sin formulario', async () => {
  const fetchMock = mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/auth/registration/preview': () => json(400, { code: 'INVALID_TOKEN', message: 'El enlace no es válido, ya se usó o venció.' }),
  });
  renderAt('/verificar-email');
  expect(await screen.findByText(/El enlace no es válido/)).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/registration/preview')).toHaveLength(0);
  cleanup();
  renderAt(`/verificar-email#token=${TOKEN}`);
  expect(await screen.findByText('El enlace no es válido, ya se usó o venció.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Crear cuenta' })).not.toBeInTheDocument();
});

it('acepta una invitación mostrando taller, rol y email de la invitación', async () => {
  const fetchMock = mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/invitations/preview': () => json(200, {
      workshopName: 'Taller ficticio Norte', email: 'mecanico@example.invalid', role: 'MECHANIC', expiresAt: '2026-11-12T12:00:00.000Z',
    }),
    'POST /api/invitations/accept': () => json(201, { message: 'Te sumaste al taller. Ya podés iniciar sesión.' }),
  });
  renderAt(`/invitacion#token=${TOKEN}`);
  expect(await screen.findByText('Taller ficticio Norte')).toBeInTheDocument();
  expect(screen.getByText('Mecánico')).toBeInTheDocument();
  fill('Tu nombre', 'Mecánico Norte');
  fill('Contraseña', 'contraseña de prueba');
  fill('Repetí la contraseña', 'contraseña de prueba');
  fireEvent.click(screen.getByRole('button', { name: 'Aceptar invitación' }));
  expect(await screen.findByText('Te sumaste al taller. Ya podés iniciar sesión.')).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/invitations/accept')).toEqual([{ token: TOKEN, name: 'Mecánico Norte', password: 'contraseña de prueba' }]);
});

it('una invitación vencida o usada muestra el motivo', async () => {
  mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/invitations/preview': () => json(400, { code: 'INVALID_TOKEN', message: 'La invitación no es válida, ya se usó o venció.' }),
  });
  renderAt(`/invitacion#token=${'b'.repeat(43)}`);
  expect(await screen.findByText('La invitación no es válida, ya se usó o venció.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Aceptar invitación' })).not.toBeInTheDocument();
});

it.each([
  ['INVITATION_EXPIRED', 'Invitación vencida'], ['INVITATION_USED', 'Invitación ya utilizada'],
])('muestra la pantalla de invitación que corresponde a %s', async (code, title) => {
  mockApi({ 'GET /api/auth/me': anonymous, 'POST /api/invitations/preview': () => json(400, { code, message: 'Aviso de la invitación.' }) });
  renderAt(`/invitacion#token=${TOKEN}`);
  expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Aceptar invitación' })).not.toBeInTheDocument();
});

it('cierra sesión y vuelve al login', async () => {
  const fetchMock = mockApi({ 'GET /api/auth/me': () => json(200, owner), 'POST /api/auth/logout': () => json(204) });
  renderAt('/');
  fireEvent.click(await screen.findByRole('link', { name: 'Cerrar sesión' }));
  expect(await screen.findByRole('heading', { name: 'Cerrar sesión' })).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/logout')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  expect(await screen.findByRole('heading', { name: 'Ingresá a tu taller' })).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/logout')).toHaveLength(1);
});

it('si el cierre de sesión falla, lo informa, mantiene la sesión y permite reintentar', async () => {
  let fail = true;
  const fetchMock = mockApi({
    'GET /api/auth/me': () => json(200, owner),
    'POST /api/auth/logout': () => { if (fail) throw new TypeError('Failed to fetch'); return json(204); },
  });
  renderAt('/');
  fireEvent.click(await screen.findByRole('link', { name: 'Cerrar sesión' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
  expect(await screen.findByText(/No se cerró la sesión/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Cerrar sesión' })).toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  expect(await screen.findByRole('heading', { name: 'Ingresá a tu taller' })).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/logout')).toHaveLength(2);
});

it.each([['/login', '/api/auth/google/start'], ['/registro', '/api/auth/google/register/start']])(
  'permite navegar a Google desde %s', async (url, href) => {
    mockApi({ 'GET /api/auth/me': anonymous });
    renderAt(url);
    expect(await screen.findByRole('link', { name: 'Continuar con Google' })).toHaveAttribute('href', href);
  },
);

it('informa que faltan credenciales sin quitar la opción de Google', async () => {
  mockApi({ 'GET /api/auth/me': anonymous });
  renderAt('/login?google=unavailable');
  expect(await screen.findByRole('alert')).toHaveTextContent('todavía no está configurado');
  expect(screen.getByRole('link', { name: 'Continuar con Google' })).toBeInTheDocument();
});

it('en Google completa los datos del taller, conserva el formulario si falla y entra al crearlo', async () => {
  let attempt = 0;
  const fetchMock = mockApi({
    'GET /api/auth/me': anonymous,
    'GET /api/auth/google/registration': () => json(204),
    'POST /api/auth/google/registration': () => (++attempt === 1
      ? json(400, { code: 'VALIDATION_ERROR', message: 'Revisá los datos.', fields: { locality: 'Ingresá una localidad.' } })
      : json(201, { ...owner, googleLinked: true })),
  });
  const router = renderAt('/registro/google');
  await screen.findByRole('heading', { name: 'Completá los datos de tu taller' });
  await screen.findByLabelText('Nombre comercial');
  fill('Nombre comercial', 'Taller ficticio');
  fill('Teléfono de contacto', '+54 11 5555-0123');
  fill('Dirección', 'Dirección ficticia 123');
  fireEvent.click(screen.getByRole('button', { name: 'Crear taller' }));
  expect(await screen.findByText('Ingresá una localidad.')).toBeInTheDocument();
  expect(screen.getByLabelText('Nombre comercial')).toHaveValue('Taller ficticio');
  fill('Localidad o ciudad del taller', 'Córdoba');
  fireEvent.click(screen.getByRole('button', { name: 'Crear taller' }));
  expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/');
  expect(calls(fetchMock, 'POST /api/auth/google/registration')[1]).toEqual({
    workshopName: 'Taller ficticio', contactPhone: '+54 11 5555-0123', address: 'Dirección ficticia 123', locality: 'Córdoba',
  });
});

it('si la sesión de registro con Google ya no es válida, permite volver al registro', async () => {
  mockApi({ 'GET /api/auth/me': anonymous, 'GET /api/auth/google/registration': () => json(400, {
    code: 'INVALID_GOOGLE_REGISTRATION', message: 'Volvé a iniciar el registro.',
  }) });
  renderAt('/registro/google');
  expect(await screen.findByRole('link', { name: 'Volver al registro' })).toHaveAttribute('href', '/registro');
  expect(screen.queryByRole('button', { name: 'Crear taller' })).not.toBeInTheDocument();
});

it('un 401 tardío del /auth/me inicial no pisa un login exitoso', async () => {
  const pendingMe: Array<(response: Response) => void> = [];
  mockApi({
    'GET /api/auth/me': () => new Promise<Response>(resolve => { pendingMe.push(resolve); }),
    'POST /api/auth/login': () => json(200, owner),
  });
  renderAt('/login');
  await screen.findByRole('heading', { name: 'Ingresá a tu taller' });
  fill('Email', 'duena@example.invalid');
  fill('Contraseña', 'contraseña de prueba');
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
  // Recién ahora responden las consultas iniciales (StrictMode hace dos).
  for (const resolve of pendingMe) resolve(anonymous());
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Ingresá a tu taller' })).not.toBeInTheDocument();
});
