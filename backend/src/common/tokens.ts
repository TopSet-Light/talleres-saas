import { createHash, randomBytes } from 'node:crypto';

/** 32 bytes aleatorios en base64url: 43 caracteres. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newToken() {
  return randomBytes(32).toString('base64url');
}

// La base guarda solo este hash; un volcado de la base no permite usar los tokens.
export function hashToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export function trimText(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}
