import type { NestExpressApplication } from '@nestjs/platform-express';
import { APP_CONFIG, AppConfig } from './config/app-config';

/** Configuración HTTP compartida por el arranque real y las pruebas. */
export function configureApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api');
  // Revisión de TS-19: confiar en una cantidad fija de proxies, no en cualquier dirección
  // privada. Solo se toma la última entrada de X-Forwarded-For, la que agregó el proxy;
  // lo que envíe el cliente queda descartado (Vite además lo reemplaza).
  app.set('trust proxy', app.get<AppConfig>(APP_CONFIG).trustProxyHops);
  return app;
}
