import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { anonymous, calls, json, mockApi, owner, renderAt, TOKEN } from '../../test-utils';
import type { SettingsInput } from '../workshop-settings/api';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const settings = {
  workshopName: 'Taller Norte', taxId: null, address: 'Dirección ficticia', locality: 'Localidad de prueba',
  contactPhone: null, contactEmail: null, documentFooter: null, defaultTerms: null,
  quoteValidityDays: 7, numbering: { workOrder: { prefix: 'OT-', next: 43 }, estimate: { prefix: 'PRE-', next: 19 } },
  logo: null, updatedAt: '2026-11-18T12:00:00Z',
};

it('solicita recuperación y muestra la respuesta pública sin revelar si existe el email', async () => {
  const api = mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/auth/password/forgot': () => json(202, { message: 'Si la cuenta existe, recibirás un enlace.' }),
  });
  renderAt('/recuperar-contrasena');
  fill('Email', 'desconocida@example.invalid');
  fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
  expect(await screen.findByRole('heading', { name: 'Revisá tu correo' })).toBeInTheDocument();
  expect(calls(api, 'POST /api/auth/password/forgot')).toEqual([{ email: 'desconocida@example.invalid' }]);
});

it('permite reintentar una solicitud fallida conservando el email', async () => {
  mockApi({ 'GET /api/auth/me': anonymous, 'POST /api/auth/password/forgot': () => json(429, { message: 'Esperá antes de reintentar.' }) });
  renderAt('/recuperar-contrasena');
  fill('Email', 'prueba@example.invalid');
  fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
  expect(await screen.findByText('Esperá antes de reintentar.')).toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toHaveValue('prueba@example.invalid');
  expect(screen.getByRole('button', { name: 'Enviar enlace' })).toBeEnabled();
});

it('valida la confirmación antes de enviar y restablece mediante el token del fragmento', async () => {
  const api = mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/auth/password/reset/preview': () => json(200, { email: 'prueba@example.invalid', expiresAt: '2026-11-18' }),
    'POST /api/auth/password/reset': () => json(200, { message: 'Contraseña actualizada.' }),
  });
  renderAt('/restablecer-contrasena#token=' + TOKEN);
  await screen.findByLabelText('Nueva contraseña');
  fill('Nueva contraseña', 'contraseña nueva de prueba');
  fill('Repetí la contraseña', 'otra');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
  expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
  expect(calls(api, 'POST /api/auth/password/reset')).toHaveLength(0);
  fill('Repetí la contraseña', 'contraseña nueva de prueba');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
  expect(await screen.findByRole('heading', { name: 'Contraseña actualizada' })).toBeInTheDocument();
  expect(calls(api, 'POST /api/auth/password/reset')).toEqual([{ token: TOKEN, password: 'contraseña nueva de prueba' }]);
});

it('rechaza enlaces vencidos o usados sin ofrecer el formulario', async () => {
  mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/auth/password/reset/preview': () => json(400, { code: 'INVALID_TOKEN', message: 'Enlace inválido.' }),
  });
  renderAt('/restablecer-contrasena#token=' + TOKEN);
  expect(await screen.findByRole('heading', { name: 'El enlace no es válido' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Solicitar otro enlace' })).toHaveAttribute('href', '/recuperar-contrasena');
});

it('un enlace que vence al guardar deja de ofrecer el formulario', async () => {
  mockApi({
    'GET /api/auth/me': anonymous,
    'POST /api/auth/password/reset/preview': () => json(200, { email: 'prueba@example.invalid' }),
    'POST /api/auth/password/reset': () => json(400, { code: 'INVALID_TOKEN' }),
  });
  renderAt('/restablecer-contrasena#token=' + TOKEN);
  await screen.findByLabelText('Nueva contraseña');
  fill('Nueva contraseña', 'contraseña nueva de prueba'); fill('Repetí la contraseña', 'contraseña nueva de prueba');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
  expect(await screen.findByRole('heading', { name: 'El enlace no es válido' })).toBeInTheDocument();
});

it('guarda todos los campos comerciales y actualiza el taller activo', async () => {
  const api = mockApi({
    'GET /api/auth/me': () => json(200, owner),
    'GET /api/workshop-settings': () => json(200, settings),
    'PUT /api/workshop-settings': body => json(200, { ...settings, ...body as SettingsInput }),
  });
  renderAt('/configuracion');
  await screen.findByLabelText('Nombre comercial');
  fill('Nombre comercial', 'Nuevo nombre');
  fill('Condiciones predeterminadas', 'Pago al retirar');
  fill('Próxima orden', '44');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
  expect(await screen.findByText('Configuración guardada.')).toBeInTheDocument();
  expect(calls(api, 'PUT /api/workshop-settings')).toEqual([{
    ...settings, logo: undefined, updatedAt: undefined, workshopName: 'Nuevo nombre', defaultTerms: 'Pago al retirar',
    numbering: { workOrder: { prefix: 'OT-', next: 44 }, estimate: { prefix: 'PRE-', next: 19 } },
  }]);
  expect(screen.getAllByText('Nuevo nombre').length).toBeGreaterThan(0);
});

it('conserva cambios cuando la API rechaza retroceder la numeración', async () => {
  mockApi({
    'GET /api/auth/me': () => json(200, owner), 'GET /api/workshop-settings': () => json(200, settings),
    'PUT /api/workshop-settings': () => json(409, { message: 'Revisá la numeración.', fields: { 'numbering.workOrder.next': 'No puede retroceder.' } }),
  });
  renderAt('/configuracion');
  await screen.findByLabelText('Nombre comercial');
  fill('Nombre comercial', 'Nombre pendiente'); fill('Próxima orden', '2');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
  expect(await screen.findByText('No puede retroceder.')).toBeInTheDocument();
  expect(screen.getByLabelText('Nombre comercial')).toHaveValue('Nombre pendiente');
  expect(screen.getByLabelText('Próxima orden')).toHaveValue(2);
});

it('sin settings.read deniega la pantalla antes de consultar datos', async () => {
  const api = mockApi({ 'GET /api/auth/me': () => json(200, { ...owner, permissions: [] }) });
  renderAt('/configuracion');
  expect(await screen.findByRole('heading', { name: 'Acceso denegado' })).toBeInTheDocument();
  expect(calls(api, 'GET /api/workshop-settings')).toHaveLength(0);
});

it('con permiso de lectura muestra los datos sin permitir cambios', async () => {
  mockApi({
    'GET /api/auth/me': () => json(200, { ...owner, role: 'RECEPTION', permissions: ['settings.read'] }),
    'GET /api/workshop-settings': () => json(200, settings),
  });
  renderAt('/configuracion');
  expect(await screen.findByLabelText('Nombre comercial')).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Guardar configuración' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Seleccionar logo')).not.toBeInTheDocument();
});

it('sube multipart y elimina el logo sin descartar el texto pendiente', async () => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }));
  let received: unknown;
  const api = mockApi({
    'GET /api/auth/me': () => json(200, owner), 'GET /api/workshop-settings': () => json(200, settings),
    'PUT /api/workshop-settings/logo': body => { received = body; return json(200, { ...settings, logo: { url: '/api/workshop-settings/logo', updatedAt: '2026-11-18' } }); },
    'DELETE /api/workshop-settings/logo': () => json(204),
  });
  renderAt('/configuracion');
  await screen.findByLabelText('Nombre comercial');
  fill('Nombre comercial', 'Sin guardar');
  const file = new File(['png de prueba'], 'logo.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Seleccionar logo'), { target: { files: [file] } });
  await screen.findByAltText('Vista previa del logo');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar logo' }));
  expect(await screen.findByText('Logo guardado.')).toBeInTheDocument();
  expect(received).toBeInstanceOf(FormData);
  expect((received as FormData).get('logo')).toBe(file);
  const request = api.mock.calls.find(([url]) => url === '/api/workshop-settings/logo')![1]!;
  expect(request.headers).toBeUndefined();
  expect(screen.getByLabelText('Nombre comercial')).toHaveValue('Sin guardar');
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar logo' }));
  await screen.findByText('Logo eliminado.');
  expect(screen.queryByAltText('Logo actual del taller')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Nombre comercial')).toHaveValue('Sin guardar');
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled());
});
