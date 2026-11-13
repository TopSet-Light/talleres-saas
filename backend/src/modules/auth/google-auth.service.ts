import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashToken, newToken, normalizeEmail, TOKEN_PATTERN } from '../../common/tokens';
import { PrismaService } from '../../database/prisma.service';
import { GoogleOidcService } from './google-oidc.service';
import { SessionService } from './session.service';

export const GOOGLE_ATTEMPT_TTL_MS = 10 * 60 * 1000;

/** Motivos que el frontend muestra en /login?google=<motivo>; no revelan datos de cuentas ajenas. */
export type GoogleFailure = 'invalid' | 'cancelled' | 'unverified' | 'no-account' | 'disabled' | 'conflict' | 'error';

export class GoogleLoginError extends Error {
  constructor(readonly reason: GoogleFailure) { super(reason); }
}

function sameValue(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Ingreso con Google para cuentas existentes (decisión de TS-20). No crea talleres ni
 * usuarios: si el email verificado no tiene cuenta, el frontend ofrece registrar el taller.
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

  /** Crea el intento y devuelve la URL de Google y el state que se ata al navegador por cookie. */
  async start(now = new Date()) {
    if (!this.google.isEnabled()) {
      throw new NotFoundException({ statusCode: 404, code: 'GOOGLE_DISABLED', message: 'El ingreso con Google no está habilitado.' });
    }
    const state = newToken();
    const nonce = newToken();
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    await this.prisma.googleLoginAttempt.create({
      data: { stateHash: hashToken(state), nonce, codeVerifier, createdAt: now, expiresAt: new Date(now.getTime() + GOOGLE_ATTEMPT_TTL_MS) },
    });
    return { state, url: this.google.authorizationUrl({ state, nonce, codeChallenge }) };
  }

  /** Valida la vuelta de Google y devuelve una sesión nueva, o lanza GoogleLoginError. */
  async callback(query: { state?: unknown; code?: unknown; error?: unknown }, browserState: unknown, now = new Date()) {
    const state = typeof query.state === 'string' ? query.state : '';
    // El state debe coincidir con la cookie de este navegador: evita que un tercero inicie la sesión por otro.
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
    if (query.error !== undefined) throw new GoogleLoginError('cancelled');
    if (typeof query.code !== 'string' || query.code.length === 0 || query.code.length > 2048) throw new GoogleLoginError('invalid');

    let profile;
    try {
      profile = await this.google.exchange({ code: query.code, codeVerifier: attempt.codeVerifier });
    } catch {
      this.logger.warn('No se pudo validar la respuesta de Google.');
      throw new GoogleLoginError('error');
    }
    if (profile.nonce !== attempt.nonce) throw new GoogleLoginError('invalid');
    if (!profile.emailVerified) throw new GoogleLoginError('unverified');

    const userId = await this.resolveUser(profile.subject, String(normalizeEmail(profile.email)));
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { membership: true } });
    if (!user.membership || user.membership.status !== 'ACTIVE') throw new GoogleLoginError('disabled');
    return this.sessions.create(user.id, now);
  }

  /**
   * Una cuenta de Google ya vinculada se reconoce por su sub, aunque cambie el email en Google.
   * La primera vez se vincula por email verificado, salvo que ese usuario ya tenga otra cuenta
   * de Google vinculada.
   */
  private async resolveUser(subject: string, email: string) {
    const linked = await this.prisma.googleIdentity.findUnique({ where: { subject } });
    if (linked) return linked.userId;
    const user = await this.prisma.user.findUnique({ where: { email }, include: { googleIdentity: true } });
    if (!user) throw new GoogleLoginError('no-account');
    if (user.googleIdentity) throw new GoogleLoginError('conflict');
    try {
      await this.prisma.googleIdentity.create({ data: { userId: user.id, subject } });
    } catch {
      // Dos ingresos simultáneos: gana uno; si el otro vinculó otra cuenta, es un conflicto.
      const now = await this.prisma.googleIdentity.findUnique({ where: { userId: user.id } });
      if (now?.subject !== subject) throw new GoogleLoginError('conflict');
    }
    return user.id;
  }
}
