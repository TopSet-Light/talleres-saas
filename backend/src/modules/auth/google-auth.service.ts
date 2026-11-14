import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashToken, newToken, TOKEN_PATTERN } from '../../common/tokens';
import { PrismaService } from '../../database/prisma.service';
import { isUniqueViolation } from './auth.service';
import { GoogleOidcService } from './google-oidc.service';
import { SessionService, StaleAccessError } from './session.service';

export const GOOGLE_ATTEMPT_TTL_MS = 10 * 60 * 1000;

/** Motivos que el frontend muestra en ?google=<motivo>; no revelan datos de cuentas ajenas. */
export type GoogleFailure =
  'invalid' | 'cancelled' | 'unverified' | 'not-linked' | 'disabled' | 'conflict' | 'error';

/** `home`: el error ocurre en una vinculación con sesión iniciada, se informa en la app y no en el login. */
export class GoogleLoginError extends Error {
  constructor(readonly reason: GoogleFailure, readonly destination: 'login' | 'home' = 'login') { super(reason); }
}

function sameValue(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Ingreso con Google (revisión de TS-20). Una cuenta de Google solo se vincula desde una sesión
 * iniciada con contraseña: el email de Google no alcanza, porque en dominios externos a Gmail o
 * Workspace `email_verified` puede seguir en true aunque el buzón haya cambiado de dueño. El
 * ingreso con Google reconoce únicamente cuentas ya vinculadas (por `sub`) y nunca crea
 * usuarios ni talleres.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleOidcService,
    private readonly sessions: SessionService,
  ) {}

  isEnabled() {
    return this.google.isEnabled();
  }

  async isLinked(userId: string) {
    return (await this.prisma.googleIdentity.count({ where: { userId } })) > 0;
  }

  /**
   * Crea el intento y devuelve la URL de Google y el state que se ata al navegador por cookie.
   * Con `linkUserId` es una vinculación: solo la puede completar la misma sesión.
   */
  async start(now = new Date(), linkUserId?: string) {
    if (!this.google.isEnabled()) {
      throw new NotFoundException({ statusCode: 404, code: 'GOOGLE_DISABLED', message: 'El ingreso con Google no está habilitado.' });
    }
    const state = newToken();
    const nonce = newToken();
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    await this.prisma.googleLoginAttempt.create({
      data: {
        stateHash: hashToken(state), nonce, codeVerifier, userId: linkUserId ?? null,
        createdAt: now, expiresAt: new Date(now.getTime() + GOOGLE_ATTEMPT_TTL_MS),
      },
    });
    return { state, url: this.google.authorizationUrl({ state, nonce, codeChallenge }) };
  }

  /**
   * Valida la vuelta de Google. En un ingreso devuelve una sesión nueva; en una vinculación,
   * guarda el vínculo y mantiene la sesión actual. Si algo falla, lanza GoogleLoginError.
   */
  async callback(query: { state?: unknown; code?: unknown; error?: unknown }, browserState: unknown, sessionToken: unknown, now = new Date()) {
    const state = typeof query.state === 'string' ? query.state : '';
    // El state debe coincidir con la cookie de este navegador: evita que un tercero complete el ingreso por otro.
    if (!TOKEN_PATTERN.test(state) || typeof browserState !== 'string' || !sameValue(state, browserState)) {
      throw new GoogleLoginError('invalid');
    }
    const attempt = await this.prisma.googleLoginAttempt.findUnique({ where: { stateHash: hashToken(state) } });
    if (!attempt) throw new GoogleLoginError('invalid');
    // Un solo uso, aunque Google o el navegador repitan la vuelta.
    const used = await this.prisma.googleLoginAttempt.updateMany({
      where: { id: attempt.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
    });
    if (used.count !== 1) throw new GoogleLoginError('invalid');

    // Una vinculación solo la completa la misma sesión con contraseña que la inició.
    if (attempt.userId) {
      const access = await this.sessions.resolve(sessionToken, now);
      if (!access || access.userId !== attempt.userId) throw new GoogleLoginError('invalid');
    }
    const destination = attempt.userId ? 'home' : 'login';
    if (query.error !== undefined) throw new GoogleLoginError('cancelled', destination);
    if (typeof query.code !== 'string' || query.code.length === 0 || query.code.length > 2048) throw new GoogleLoginError('invalid', destination);

    let profile;
    try {
      profile = await this.google.exchange({ code: query.code, codeVerifier: attempt.codeVerifier });
    } catch {
      this.logger.warn('No se pudo validar la respuesta de Google.');
      throw new GoogleLoginError('error', destination);
    }
    if (profile.nonce !== attempt.nonce) throw new GoogleLoginError('invalid', destination);
    if (!profile.emailVerified) throw new GoogleLoginError('unverified', destination);

    if (attempt.userId) {
      await this.link(attempt.userId, profile.subject);
      return { mode: 'link' as const };
    }
    const identity = await this.prisma.googleIdentity.findUnique({ where: { subject: profile.subject } });
    if (!identity) throw new GoogleLoginError('not-linked');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: identity.userId }, include: { membership: true } });
    if (!user.membership || user.membership.status !== 'ACTIVE') throw new GoogleLoginError('disabled');
    try {
      return { mode: 'login' as const, session: await this.sessions.create(user.id, now, {}) };
    } catch (error) {
      if (error instanceof StaleAccessError) throw new GoogleLoginError('disabled');
      throw error;
    }
  }

  /** Una cuenta de Google se vincula a un solo usuario, y un usuario a una sola cuenta de Google. */
  private async link(userId: string, subject: string) {
    const existing = await this.prisma.googleIdentity.findFirst({ where: { OR: [{ userId }, { subject }] } });
    if (existing) {
      if (existing.userId === userId && existing.subject === subject) return;
      throw new GoogleLoginError('conflict', 'home');
    }
    try {
      await this.prisma.googleIdentity.create({ data: { userId, subject } });
    } catch (error) {
      // Vinculación simultánea: si quedó la misma, es inocua; si no, es un conflicto.
      if (!isUniqueViolation(error)) throw error;
      const now = await this.prisma.googleIdentity.findUnique({ where: { userId } });
      if (now?.subject !== subject) throw new GoogleLoginError('conflict', 'home');
    }
  }

  async unlink(userId: string) {
    const removed = await this.prisma.googleIdentity.deleteMany({ where: { userId } });
    if (removed.count === 0) {
      throw new NotFoundException({ statusCode: 404, code: 'NOT_FOUND', message: 'Tu cuenta no tiene Google vinculado.' });
    }
  }
}
