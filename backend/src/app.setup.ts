import type { NestExpressApplication } from '@nestjs/platform-express';

/** Configuración HTTP compartida por el arranque real y las pruebas. */
export function configureApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api');
  // Confiar solo en proxies de redes privadas (Vite en Compose, proxy del VPS) para obtener la IP real.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  return app;
}
