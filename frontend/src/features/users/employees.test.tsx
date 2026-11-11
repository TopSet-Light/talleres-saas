import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { calls, json, mockApi, owner, renderAt } from '../../test-utils';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const self = { id: 'm1', name: 'Dueña Norte', email: 'duena@example.invalid', role: 'OWNER', status: 'ACTIVE', createdAt: '2026-11-09T12:00:00.000Z', isCurrentUser: true };
const mechanic = { id: 'm2', name: 'Mecánico Norte', email: 'mecanico@example.invalid', role: 'MECHANIC', status: 'ACTIVE', createdAt: '2026-11-09T12:00:00.000Z', isCurrentUser: false };

function rowOf(name: string) {
  return screen.getByText(name).closest('li') as HTMLElement;
}

it('lista el equipo, sin acciones sobre la propia cuenta, y desactiva un acceso', async () => {
  let current = mechanic;
  const fetchMock = mockApi({
    'GET /api/auth/me': () => json(200, owner),
    'GET /api/employees': () => json(200, [self, current]),
    'GET /api/invitations': () => json(200, []),
    'PATCH /api/employees/m2': body => { current = { ...current, ...(body as object) }; return json(200, current); },
  });
  renderAt('/empleados');
  expect(await screen.findByText('Mecánico Norte')).toBeInTheDocument();
  expect(screen.getByText('No hay invitaciones pendientes.')).toBeInTheDocument();
  expect(within(rowOf('Dueña Norte (vos)')).queryByRole('button')).not.toBeInTheDocument();

  fireEvent.click(within(rowOf('Mecánico Norte')).getByRole('button', { name: 'Desactivar acceso' }));
  expect(await screen.findByText('Desactivaste el acceso de Mecánico Norte.')).toBeInTheDocument();
  expect(await screen.findByText('Acceso desactivado')).toBeInTheDocument();
  expect(calls(fetchMock, 'PATCH /api/employees/m2')).toEqual([{ status: 'INACTIVE' }]);
});

it('invita con rol y muestra el error de la API', async () => {
  let invitations: unknown[] = [];
  const fetchMock = mockApi({
    'GET /api/auth/me': () => json(200, owner),
    'GET /api/employees': () => json(200, [self]),
    'GET /api/invitations': () => json(200, invitations),
    'POST /api/invitations': body => {
      const { email } = body as { email: string };
      if (email === 'ya@example.invalid') return json(409, { code: 'ALREADY_MEMBER', message: 'Esa persona ya forma parte del taller.' });
      const created = { id: 'i1', email, role: 'RECEPTION', createdAt: '2026-11-09T12:00:00.000Z', expiresAt: '2026-11-12T12:00:00.000Z' };
      invitations = [created];
      return json(201, { ...created, emailSent: true });
    },
  });
  renderAt('/empleados');
  await screen.findByRole('heading', { name: 'Invitar a una persona' });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ya@example.invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));
  expect(await screen.findByText('Esa persona ya forma parte del taller.')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'recepcion@example.invalid' } });
  fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'RECEPTION' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));
  expect(await screen.findByText(/Invitación enviada a recepcion@example.invalid/)).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Revocar' })).toBeInTheDocument();
  expect(calls(fetchMock, 'POST /api/invitations')[1]).toEqual({ email: 'recepcion@example.invalid', role: 'RECEPTION' });
});

it('un rol sin permiso no ve la pantalla ni consulta empleados', async () => {
  const fetchMock = mockApi({ 'GET /api/auth/me': () => json(200, { ...owner, role: 'MECHANIC', permissions: ['workOrders.diagnose'] }) });
  renderAt('/empleados');
  expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Empleados' })).not.toBeInTheDocument();
  expect(calls(fetchMock, 'GET /api/employees')).toHaveLength(0);
});

it('si la sesión vence durante una acción, vuelve al login', async () => {
  mockApi({
    'GET /api/auth/me': () => json(200, owner),
    'GET /api/employees': () => json(200, [self, mechanic]),
    'GET /api/invitations': () => json(200, []),
    'PATCH /api/employees/m2': () => json(401, { code: 'UNAUTHENTICATED', message: 'Tu sesión venció o no es válida. Iniciá sesión de nuevo.' }),
  });
  const router = renderAt('/empleados');
  fireEvent.click(within(await screen.findByText('Mecánico Norte').then(el => el.closest('li') as HTMLElement)).getByRole('button', { name: 'Desactivar acceso' }));
  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/login');
});

it('muestra error de carga y permite reintentar', async () => {
  let fail = true;
  mockApi({
    'GET /api/auth/me': () => json(200, owner),
    'GET /api/employees': () => (fail ? json(500, { statusCode: 500, message: 'Internal server error' }) : json(200, [self])),
    'GET /api/invitations': () => json(200, []),
  });
  renderAt('/empleados');
  expect(await screen.findByText('Internal server error')).toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('Dueña Norte (vos)')).toBeInTheDocument();
});
