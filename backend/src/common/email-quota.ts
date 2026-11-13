import type { Prisma } from '@prisma/client';

/** Emails por destinatario y por hora en registro y recuperación de contraseña. */
export const EMAILS_PER_RECIPIENT_PER_HOUR = 3;
export const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Serializa, dentro de la transacción, las operaciones sobre un mismo destinatario.
 * Contar los envíos recientes y registrar uno nuevo debe ser atómico: sin este bloqueo,
 * pedidos simultáneos leen el mismo contador y superan el límite (revisión de TS-19).
 * El bloqueo se libera solo al terminar la transacción.
 */
export async function lockRecipient(tx: Prisma.TransactionClient, scope: 'registro' | 'recuperacion', email: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${scope}:${email}`}, 0))`;
}
