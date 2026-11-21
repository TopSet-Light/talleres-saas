import { resolve } from 'node:path';
import { isEmail } from 'class-validator';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  /** URL pública desde la que el navegador usa la aplicación, sin barra final. */
  appUrl: string;
  /** Origen de `appUrl`; las operaciones de cambio deben llegar desde aquí. */
  appOrigin: string;
  /** `Secure` en la cookie de sesión. Debe ser `true` fuera de desarrollo local. */
  cookieSecure: boolean;
  mailTransport: 'smtp' | 'resend';
  /** Secreto exclusivo del backend; solo se usa con el transporte Resend. */
  resendApiKey?: string;
  smtpHost: string;
  smtpPort: number;
  /** TLS desde la conexión (puerto 465). Con `false` y credenciales, se exige STARTTLS. */
  smtpSecure: boolean;
  /** Credenciales del proveedor SMTP. Mailpit no las usa; en producción se inyectan por entorno. */
  smtpUser?: string;
  smtpPassword?: string;
  /** Cliente OAuth de Google. Sin ambos valores, el ingreso con Google queda deshabilitado. */
  googleClientId?: string;
  googleClientSecret?: string;
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
  const mailTransport = env.MAIL_TRANSPORT || 'smtp';
  if (mailTransport !== 'smtp' && mailTransport !== 'resend') {
    throw new Error('MAIL_TRANSPORT debe ser smtp o resend');
  }
  const resendApiKey = env.RESEND_API_KEY?.trim() || undefined;
  const mailFrom = env.MAIL_FROM?.trim() || 'Gestión de talleres <no-responder@talleres.local>';
  if (mailTransport === 'resend' && !resendApiKey) {
    throw new Error('RESEND_API_KEY es obligatoria con MAIL_TRANSPORT=resend');
  }
  if (mailTransport === 'resend' || env.NODE_ENV === 'production') {
    const sender = mailFrom.match(/^[^<>\r\n]+<([^<>\r\n]+)>$/)?.[1] || mailFrom;
    if (!env.MAIL_FROM?.trim() || /[\r\n]/.test(mailFrom) || !isEmail(sender)) {
      throw new Error('MAIL_FROM debe ser un remitente válido de un dominio verificado');
    }
    if (!env.APP_URL?.trim()) throw new Error('APP_URL es obligatoria para enviar correos reales');
  }
  if (env.NODE_ENV === 'production' && (!appOrigin.startsWith('https:') || !cookieSecure)) {
    throw new Error('En producción APP_URL debe usar HTTPS y COOKIE_SECURE no puede ser false');
  }
  const smtpPort = positiveInteger(env.SMTP_PORT, 1025, 'SMTP_PORT');
  const smtpUser = env.SMTP_USER || undefined;
  const smtpPassword = env.SMTP_PASSWORD || undefined;
  // El mensaje nunca incluye los valores: la contraseña no debe llegar a logs.
  if (Boolean(smtpUser) !== Boolean(smtpPassword)) throw new Error('SMTP_USER y SMTP_PASSWORD deben configurarse juntos');
  if (env.NODE_ENV === 'production' && mailTransport === 'smtp' &&
    (!env.SMTP_HOST || env.SMTP_HOST.toLowerCase() === 'mailpit' || !env.SMTP_PORT || !smtpUser)) {
    throw new Error('En producción SMTP requiere SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASSWORD de un proveedor real');
  }
  const googleClientId = env.GOOGLE_CLIENT_ID || undefined;
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET || undefined;
  if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
    throw new Error('GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET deben configurarse juntos');
  }
  return {
    appUrl,
    appOrigin,
    cookieSecure,
    mailTransport,
    resendApiKey,
    smtpHost: env.SMTP_HOST || 'mailpit',
    smtpPort,
    smtpSecure: env.SMTP_SECURE === undefined || env.SMTP_SECURE === '' ? smtpPort === 465 : env.SMTP_SECURE === 'true',
    smtpUser,
    smtpPassword,
    googleClientId,
    googleClientSecret,
    mailFrom,
    authRateLimit: positiveInteger(env.AUTH_RATE_LIMIT, 10, 'AUTH_RATE_LIMIT'),
    trustProxyHops: integer(env.TRUST_PROXY_HOPS, 1, 'TRUST_PROXY_HOPS', 0),
    filesDir: resolve(env.FILES_DIR || 'data/files'),
  };
}
