import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { anonymous, calls, json, mockApi, owner, renderAt, TOKEN } from '../../test-utils';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

it('sin sesión redirige al login', async () => {
  mockApi({ 'GET /api/auth/me': anonymous });
  const router = renderAt('/');
  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/login');
});

it('inicia sesión y muestra el taller y el menú del dueño', async () => {
  const fetchMock = mockApi({ 'GET /api/auth/me': anonymous, 'POST /api/auth/login': () => json(200, owner) });
  renderAt('/login');
  await screen.findByRole('heading', { name: 'Iniciar sesión' });
  fill('Email', 'duena@example.invalid');
  fill('Contraseña', 'contraseña de prueba');
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  expect(await screen.findByRole('heading', { name: 'Hola, Dueña Norte' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Empleados' })).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/login')).toEqual([{ email: 'duena@example.invalid', password: 'contraseña de prueba' }]);
});

it('muestra el error genérico y permite reenviar la verificación', async () => {
  const fetchMock = mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/auth/login': () => json(403, { code: 'EMAIL_NOT_VERIFIED', message: 'Verificá tu email antes de iniciar sesión.' }),
    'POST /api/auth/resend-verification': () => json(202, { message: 'Te enviamos un nuevo enlace.' }),
  });
  renderAt('/login');
  await screen.findByRole('heading', { name: 'Iniciar sesión' });
  fill('Email', 'pendiente@example.invalid');
  fill('Contraseña', 'x');
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  expect(await screen.findByText('Verificá tu email antes de iniciar sesión.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reenviar email de verificación' }));
  expect(await screen.findByText('Te enviamos un nuevo enlace.')).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/resend-verification')).toEqual([{ email: 'pendiente@example.invalid' }]);
});

it('registro: valida la confirmación, muestra errores de la API y luego pide revisar el email', async () => {
  let attempt = 0;
  const fetchMock = mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/auth/register': () => (++attempt === 1
      ? json(400, { code: 'VALIDATION_ERROR', message: 'Revisá los datos ingresados.', fields: { password: 'La contraseña no puede ser igual al email.' } })
      : json(202, { message: 'ok' })),
  });
  renderAt('/registro');
  await screen.findByRole('heading', { name: 'Registrá tu taller' });
  fill('Nombre del taller', 'Taller ficticio');
  fill('Tu nombre', 'Persona');
  fill('Email', 'persona@example.invalid');
  fill('Contraseña', 'contraseña larga uno');
  fill('Repetí la contraseña', 'otra contraseña');
  fireEvent.click(screen.getByRole('button', { name: 'Registrar taller' }));
  expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/register')).toHaveLength(0);

  fill('Repetí la contraseña', 'contraseña larga uno');
  fireEvent.click(screen.getByRole('button', { name: 'Registrar taller' }));
  expect(await screen.findByText('La contraseña no puede ser igual al email.')).toBeInTheDocument();
  expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'Registrar taller' }));
  expect(await screen.findByRole('heading', { name: 'Revisá tu email' })).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/register')[1]).toEqual({
    workshopName: 'Taller ficticio', ownerName: 'Persona', email: 'persona@example.invalid', password: 'contraseña larga uno',
  });
});

it('verifica el email una sola vez aunque React monte dos veces', async () => {
  const fetchMock = mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/auth/verify-email': () => json(200, { message: 'Email verificado. Ya podés iniciar sesión.' }),
  });
  renderAt(`/verificar-email#token=${TOKEN}`);
  expect(await screen.findByText('Email verificado. Ya podés iniciar sesión.')).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/verify-email')).toEqual([{ token: TOKEN }]);
});

it('un enlace sin token muestra error sin llamar a la API', async () => {
  const fetchMock = mockApi({ 'GET /api/auth/me': anonymous });
  renderAt('/verificar-email');
  expect(await screen.findByText(/El enlace no es válido/)).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/verify-email')).toHaveLength(0);
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

it('cierra sesión y vuelve al login', async () => {
  const fetchMock = mockApi({ 'GET /api/auth/me': () => json(200, owner), 'POST /api/auth/logout': () => json(204) });
  renderAt('/');
  fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/auth/logout')).toHaveLength(1);
});
