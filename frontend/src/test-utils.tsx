import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from './app/routes';

export const TOKEN = 'a'.repeat(43);

export const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const anonymous = () => json(401, { statusCode: 401, code: 'UNAUTHENTICATED', message: 'Tu sesión venció o no es válida. Iniciá sesión de nuevo.' });

export const owner = {
  user: { id: 'u1', name: 'Dueña Norte', email: 'duena@example.invalid' },
  workshop: { id: 'w1', name: 'Taller ficticio Norte' },
  role: 'OWNER',
  permissions: ['employees.read', 'employees.invite', 'employees.changeRole', 'employees.deactivate'],
};

type Handler = (body: unknown) => Response | Promise<Response>;

/** Simula la API por método y ruta. Una ruta no prevista falla como error de red. */
export function mockApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const handler = handlers[`${init?.method ?? 'GET'} ${url}`];
    if (!handler) throw new TypeError(`Sin respuesta simulada para ${init?.method ?? 'GET'} ${url}`);
    return handler(init?.body ? JSON.parse(String(init.body)) : undefined);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function calls(fetchMock: ReturnType<typeof mockApi>, key: string) {
  return fetchMock.mock.calls
    .filter(([url, init]) => `${init?.method ?? 'GET'} ${url}` === key)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));
}

export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<StrictMode><RouterProvider router={router} /></StrictMode>);
  return router;
}
