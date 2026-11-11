import { ForbiddenException, Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { SESSION_COOKIE } from './session-cookie';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protección CSRF complementaria a SameSite=Lax. Una operación de cambio con un
 * Origin distinto del de la aplicación se rechaza. Si el pedido trae la cookie
 * de sesión, el Origin es obligatorio: los navegadores siempre lo envían en
 * pedidos POST, PATCH y DELETE hechos con fetch.
 */
@Injectable()
export class OriginMiddleware implements NestMiddleware {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  use(req: Request, _res: Response, next: NextFunction) {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.headers.origin;
    const hasSession = typeof req.cookies?.[SESSION_COOKIE] === 'string';
    if ((origin && origin !== this.config.appOrigin) || (!origin && hasSession)) {
      throw new ForbiddenException({
        statusCode: 403, code: 'ORIGIN_NOT_ALLOWED', message: 'Origen de la solicitud no permitido.',
      });
    }
    next();
  }
}
