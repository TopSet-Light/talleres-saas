import type { IncomingMessage } from 'node:http';

type ProxyRequest = { setHeader(name: string, value: string): void; removeHeader(name: string): void };
type ProxyServer = { on(event: 'proxyReq', listener: (proxyReq: ProxyRequest, req: IncomingMessage) => void): unknown };

/**
 * La API limita intentos por IP. El proxy no conserva un X-Forwarded-For enviado por el
 * cliente: lo reemplaza por la dirección de la conexión, así nadie elige con qué IP lo
 * cuenta la API. La API confía en un único proxy (TRUST_PROXY_HOPS=1).
 */
export function forwardClientAddress(proxy: ProxyServer) {
  proxy.on('proxyReq', (proxyReq, req) => {
    const address = req.socket.remoteAddress;
    if (address) proxyReq.setHeader('x-forwarded-for', address);
    else proxyReq.removeHeader('x-forwarded-for');
  });
}

export const apiProxy = {
  '/api': { target: 'http://api:3000', changeOrigin: true, xfwd: false, configure: forwardClientAddress },
};
