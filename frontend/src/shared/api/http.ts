/** Error público de la API. Nunca contiene detalles internos: solo lo que la API decidió mostrar. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const NETWORK_ERROR = 'No pudimos conectar con el servidor. Revisá tu conexión y volvé a intentar.';
const SERVER_ERROR = 'Ocurrió un error en el servidor. Volvé a intentar en unos minutos.';
const TIMEOUT_MS = 10_000;

let onUnauthorized: (() => void) | undefined;

/** La sesión registra cómo reaccionar si la API informa que la sesión venció. */
export function setUnauthorizedHandler(handler: (() => void) | undefined) {
  onUnauthorized = handler;
}

export function toApiError(error: unknown) {
  return error instanceof ApiError ? error : new ApiError(0, 'Ocurrió un error inesperado. Volvé a intentar.');
}

function readError(status: number, body: unknown) {
  const data = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
  const message = typeof data.message === 'string' ? data.message : status >= 500 ? SERVER_ERROR : 'No pudimos completar la operación.';
  const code = typeof data.code === 'string' ? data.code : undefined;
  const fields: Record<string, string> = {};
  if (typeof data.fields === 'object' && data.fields !== null) {
    for (const [key, value] of Object.entries(data.fields)) if (typeof value === 'string') fields[key] = value;
  }
  return new ApiError(status, message, code, fields);
}

/** Pedidos a rutas relativas /api; la cookie de sesión la envía el navegador. */
export async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 204) return undefined as T;
  let body: unknown;
  try { body = await response.json(); } catch { body = undefined; }
  if (!response.ok) {
    const error = readError(response.status, body);
    if (error.status === 401 && error.code === 'UNAUTHENTICATED') onUnauthorized?.();
    throw error;
  }
  return body as T;
}
