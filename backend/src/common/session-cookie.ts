import type { CookieOptions } from 'express';
import type { AppConfig } from '../config/app-config';

export const SESSION_COOKIE = 'taller_sesion';

// La cookie solo viaja a la API y nunca es legible desde JavaScript.
export function sessionCookieOptions(config: AppConfig, expires?: Date): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/api', ...(expires ? { expires } : {}) };
}
