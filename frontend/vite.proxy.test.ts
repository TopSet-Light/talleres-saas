import type { IncomingMessage } from 'node:http';
import { expect, it } from 'vitest';
import { apiProxy, forwardClientAddress } from './vite.proxy';

function simulate(remoteAddress: string | undefined, incoming: Record<string, string>) {
  const headers: Record<string, string> = { ...incoming };
  let listener: ((proxyReq: { setHeader(n: string, v: string): void; removeHeader(n: string): void }, req: IncomingMessage) => void) | undefined;
  forwardClientAddress({ on: (_event, handler) => { listener = handler; } });
  listener!(
    { setHeader: (name, value) => { headers[name] = value; }, removeHeader: name => { delete headers[name]; } },
    { socket: { remoteAddress } } as IncomingMessage,
  );
  return headers;
}

it('reemplaza el X-Forwarded-For enviado por el cliente con la dirección de la conexión', () => {
  expect(simulate('172.18.0.1', { 'x-forwarded-for': '203.0.113.9, 10.0.0.5' })['x-forwarded-for']).toBe('172.18.0.1');
});

it('sin dirección conocida no reenvía un valor del cliente', () => {
  expect(simulate(undefined, { 'x-forwarded-for': '203.0.113.9' })).not.toHaveProperty('x-forwarded-for');
});

it('el proxy no agrega la cadena recibida', () => {
  expect(apiProxy['/api'].xfwd).toBe(false);
});
