import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('muestra carga y luego la respuesta real', async () => {
  let resolve!: (value: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>(r => { resolve = r; }));
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  expect(screen.getByText('Consultando…')).toBeInTheDocument();
  resolve(new Response(JSON.stringify({ status: 'ok', database: 'ok' })));
  expect(await screen.findByText('Conexión correcta')).toBeInTheDocument();
  expect(fetchMock.mock.calls[0]).toEqual(['/api/health', expect.any(Object)]);
  expect(screen.getByText(/"database": "ok"/)).toBeInTheDocument();
});
it.each([503, 200])('rechaza estado no saludable con HTTP %s', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'unavailable', database: 'unavailable' }), { status })));
  render(<App />);
  expect(await screen.findByText('Servicio no disponible')).toBeInTheDocument();
  expect(screen.getByText(/"database": "unavailable"/)).toBeInTheDocument();
});
it('sale de carga cuando la API no responde', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  render(<App />);
  expect(await screen.findByText('Servicio no disponible')).toBeInTheDocument();
});
it('sale de carga ante una respuesta que no es JSON', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })));
  render(<App />);
  expect(await screen.findByText('Servicio no disponible')).toBeInTheDocument();
});
it('cancela una consulta colgada a los siete segundos', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  })));
  render(<App />);
  await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
  expect(screen.getByText('Servicio no disponible')).toBeInTheDocument();
});
