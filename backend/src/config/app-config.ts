export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  /** URL pública desde la que el navegador usa la aplicación, sin barra final. */
  appUrl: string;
  /** Origen de `appUrl`; las operaciones de cambio deben llegar desde aquí. */
  appOrigin: string;
  /** `Secure` en la cookie de sesión. Debe ser `true` fuera de desarrollo local. */
  cookieSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  mailFrom: string;
  /** Peticiones por minuto y por IP en registro, login, invitaciones y verificación. */
  authRateLimit: number;
}

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} debe ser un entero positivo`);
  return parsed;
}

// Los valores por defecto solo sirven para desarrollo local; ninguno es secreto.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appUrl = (env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  let appOrigin: string;
  try {
    const url = new URL(appUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    appOrigin = url.origin;
  } catch {
    throw new Error('APP_URL debe ser una URL http o https');
  }
  const cookieSecure = env.COOKIE_SECURE === undefined || env.COOKIE_SECURE === ''
    ? appOrigin.startsWith('https:')
    : env.COOKIE_SECURE === 'true';
  return {
    appUrl,
    appOrigin,
    cookieSecure,
    smtpHost: env.SMTP_HOST || 'mailpit',
    smtpPort: positiveInteger(env.SMTP_PORT, 1025, 'SMTP_PORT'),
    mailFrom: env.MAIL_FROM || 'Gestión de talleres <no-responder@talleres.local>',
    authRateLimit: positiveInteger(env.AUTH_RATE_LIMIT, 10, 'AUTH_RATE_LIMIT'),
  };
}
