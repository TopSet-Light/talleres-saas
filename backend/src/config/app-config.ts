import { resolve } from 'node:path';

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
  /** TLS desde la conexión (puerto 465). Con `false` y credenciales, se exige STARTTLS. */
  smtpSecure: boolean;
  /** Credenciales del proveedor SMTP. Mailpit no las usa; en producción se inyectan por entorno. */
  smtpUser?: string;
  smtpPassword?: string;
  mailFrom: string;
  /** Peticiones por minuto y por IP en registro, login, invitaciones y verificación. */
  authRateLimit: number;
  /**
   * Cantidad de proxies delante de la API que reemplazan X-Forwarded-For (Vite en local,
   * el proxy del VPS en producción). Con 0 se usa la dirección de la conexión.
   */
  trustProxyHops: number;
  /** Carpeta privada de archivos subidos (logos). Nunca se sirve de forma estática. */
  filesDir: string;
}

function integer(value: string | undefined, fallback: number, name: string, min: number) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) throw new Error(`${name} debe ser un entero mayor o igual a ${min}`);
  return parsed;
}
const positiveInteger = (value: string | undefined, fallback: number, name: string) => integer(value, fallback, name, 1);

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
  const smtpPort = positiveInteger(env.SMTP_PORT, 1025, 'SMTP_PORT');
  const smtpUser = env.SMTP_USER || undefined;
  const smtpPassword = env.SMTP_PASSWORD || undefined;
  // El mensaje nunca incluye los valores: la contraseña no debe llegar a logs.
  if (Boolean(smtpUser) !== Boolean(smtpPassword)) throw new Error('SMTP_USER y SMTP_PASSWORD deben configurarse juntos');
  return {
    appUrl,
    appOrigin,
    cookieSecure,
    smtpHost: env.SMTP_HOST || 'mailpit',
    smtpPort,
    smtpSecure: env.SMTP_SECURE === undefined || env.SMTP_SECURE === '' ? smtpPort === 465 : env.SMTP_SECURE === 'true',
    smtpUser,
    smtpPassword,
    mailFrom: env.MAIL_FROM || 'Gestión de talleres <no-responder@talleres.local>',
    authRateLimit: positiveInteger(env.AUTH_RATE_LIMIT, 10, 'AUTH_RATE_LIMIT'),
    trustProxyHops: integer(env.TRUST_PROXY_HOPS, 1, 'TRUST_PROXY_HOPS', 0),
    filesDir: resolve(env.FILES_DIR || 'data/files'),
  };
}
