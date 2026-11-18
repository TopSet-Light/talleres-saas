import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { hashToken, newToken, TOKEN_PATTERN } from '../../common/tokens';
import type { Access } from './access';

export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
// Renovar la actividad como mucho cada cinco minutos evita una escritura por pedido.
const TOUCH_EVERY_MS = 5 * 60 * 1000;

type Tx = Prisma.TransactionClient;

/** La contraseña o la pertenencia cambiaron mientras se iniciaba la sesión. */
export class StaleAccessError extends Error {}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea la sesión. Con `guard`, vuelve a comprobar dentro de la misma transacción que la
   * contraseña verificada siga vigente y que la pertenencia siga activa, con bloqueos
   * compartidos (FOR SHARE). Un restablecimiento o una baja que cambian esas filas esperan a que
   * termine esta transacción y revocan la sesión recién creada; si ocurrieron antes, esta
   * transacción ve el cambio y no crea la sesión (revisión de TS-20).
   */
  async create(userId: string, now = new Date(), guard?: { passwordHash?: string }) {
    return this.prisma.$transaction(async tx => {
      if (guard) {
        if (guard.passwordHash !== undefined) {
          const credential = await tx.$queryRaw<{ password_hash: string }[]>`
            SELECT password_hash FROM credencial WHERE usuario_id = ${userId}::uuid FOR SHARE`;
          if (credential[0]?.password_hash !== guard.passwordHash) throw new StaleAccessError();
        }
        const membership = await tx.$queryRaw<{ status: string }[]>`
          SELECT status::text AS status FROM pertenencia WHERE usuario_id = ${userId}::uuid FOR SHARE`;
        if (membership[0]?.status !== 'ACTIVE') throw new StaleAccessError();
      }
      return this.issue(tx, userId, now);
    });
  }

  async issue(tx: Tx, userId: string, now: Date) {
    const token = newToken();
    const expiresAt = new Date(now.getTime() + SESSION_MAX_MS);
    await tx.session.create({
      data: {
        tokenHash: hashToken(token), userId, createdAt: now, lastSeenAt: now,
        idleExpiresAt: new Date(now.getTime() + SESSION_IDLE_MS), expiresAt,
      },
    });
    return { token, expiresAt };
  }

  /**
   * Devuelve el contexto de acceso solo si la sesión está vigente y la
   * pertenencia sigue activa. Una baja corta el acceso en el pedido siguiente.
   */
  async resolve(token: unknown, now = new Date()): Promise<Access | null> {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { membership: { include: { workshop: true } } } } },
    });
    if (!session || session.revokedAt || session.idleExpiresAt <= now || session.expiresAt <= now) return null;
    const membership = session.user.membership;
    if (!membership || membership.status !== 'ACTIVE') return null;
    if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_EVERY_MS) {
      const idle = Math.min(now.getTime() + SESSION_IDLE_MS, session.expiresAt.getTime());
      await this.prisma.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { lastSeenAt: now, idleExpiresAt: new Date(idle) },
      });
    }
    return {
      sessionId: session.id,
      userId: session.userId,
      name: session.user.name,
      email: session.user.email,
      membershipId: membership.id,
      workshopId: membership.workshopId,
      workshopName: membership.workshop.name,
      role: membership.role,
    };
  }

  async revoke(token: unknown, now = new Date()) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return;
    await this.prisma.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: now } });
  }

  revokeAllForUser(tx: Tx, userId: string, now = new Date()) {
    return tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  }
}
