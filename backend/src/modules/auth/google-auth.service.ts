import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { lockRecipient } from '../../common/email-quota';
import { hashToken, newToken, normalizeEmail, TOKEN_PATTERN } from '../../common/tokens';
import { PrismaService } from '../../database/prisma.service';
import { createWorkshopOwner, isUniqueViolation, requireWorkshopContact } from './auth.service';
import { WorkshopRegistrationDto } from './dto';
import { GoogleOidcService, GoogleProfile } from './google-oidc.service';
import { permissionsFor } from './permissions';
import { SessionService, StaleAccessError } from './session.service';

export const GOOGLE_ATTEMPT_TTL_MS = 10 * 60 * 1000;
export const GOOGLE_REGISTRATION_TTL_MS = 30 * 60 * 1000;

const INVALID_REGISTRATION = {
  statusCode: 400, code: 'INVALID_GOOGLE_REGISTRATION',
  message: 'El registro con Google venció o ya se completó. Volvé a iniciar el registro.',
};

/** Motivos que el frontend muestra en ?google=<motivo>; no revelan datos de cuentas ajenas. */
export type GoogleFailure =
  'invalid' | 'cancelled' | 'unverified' | 'not-linked' | 'disabled' | 'conflict' | 'error'
  | 'already-registered' | 'email-needs-verification';

type GoogleDestination = 'login' | 'home' | 'register';

/** `home`: el error ocurre en una vinculación con sesión iniciada, se informa en la app y no en el login. */
export class GoogleLoginError extends Error {
  constructor(readonly reason: GoogleFailure, readonly destination: GoogleDestination = 'login') { super(reason); }
}

function sameValue(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

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
   * Con `link` es una vinculación: guarda la sesión exacta que la inicia, y solo esa sesión,
   * todavía vigente, la puede completar.
   */
  async start(now = new Date(), intent?: 'register' | { userId: string; sessionId: string }) {
    if (!this.google.isEnabled()) {
      throw new NotFoundException({ statusCode: 404, code: 'GOOGLE_DISABLED', message: 'El ingreso con Google no está habilitado.' });
    }
    const state = newToken();
    const nonce = newToken();
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const registration = intent === 'register';
    const link = typeof intent === 'object' ? intent : undefined;
    await this.prisma.googleLoginAttempt.create({
      data: {
        stateHash: hashToken(state), nonce, codeVerifier, registration, userId: link?.userId, sessionId: link?.sessionId,
        createdAt: now, expiresAt: new Date(now.getTime() + GOOGLE_ATTEMPT_TTL_MS),
      },
    });
    return { state, url: this.google.authorizationUrl({ state, nonce, codeChallenge, registration }) };
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

    // Una vinculación solo la completa la misma sesión que la inició: se compara la sesión, no el
    // usuario. Volver a iniciar sesión con la misma cuenta crea otra sesión y no alcanza.
    if (attempt.userId) {
      const access = await this.sessions.resolve(sessionToken, now);
      if (!access || !attempt.sessionId || access.sessionId !== attempt.sessionId) throw new GoogleLoginError('invalid');
    }
    const destination = attempt.userId ? 'home' : attempt.registration ? 'register' : 'login';
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

    if (attempt.userId && attempt.sessionId) {
      await this.link({ userId: attempt.userId, sessionId: attempt.sessionId }, profile.subject, now);
      return { mode: 'link' as const };
    }
    const identity = await this.prisma.googleIdentity.findUnique({ where: { subject: profile.subject } });
    if (!identity) {
      if (attempt.registration) return this.beginRegistration(profile, now);
      throw new GoogleLoginError('not-linked');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: identity.userId }, include: { membership: true } });
    if (!user.membership || user.membership.status !== 'ACTIVE') throw new GoogleLoginError('disabled', destination);
    try {
      return { mode: 'login' as const, session: await this.sessions.create(user.id, now, {}) };
    } catch (error) {
      if (error instanceof StaleAccessError) throw new GoogleLoginError('disabled', destination);
      throw error;
    }
  }

  private async beginRegistration(profile: GoogleProfile, now: Date) {
    const email = normalizeEmail(profile.email);
    // Google acredita el control actual del buzón para Gmail y cuentas administradas de Workspace.
    if (typeof email !== 'string' || email.length > 254 || !isEmail(email)
      || (!email.endsWith('@gmail.com') && !profile.hostedDomain)) {
      throw new GoogleLoginError('email-needs-verification', 'register');
    }
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new GoogleLoginError('already-registered', 'register');
    }
    const token = newToken();
    const ownerName = (profile.name?.trim() || email.split('@')[0]).slice(0, 160);
    await this.prisma.googleRegistration.create({
      data: {
        tokenHash: hashToken(token), subject: profile.subject, email, ownerName,
        createdAt: now,
        expiresAt: new Date(now.getTime() + GOOGLE_REGISTRATION_TTL_MS),
      },
    });
    return { mode: 'register' as const, token };
  }

  async previewRegistration(token: unknown, now = new Date()) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw new BadRequestException(INVALID_REGISTRATION);
    const pending = await this.prisma.googleRegistration.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!pending || pending.usedAt || pending.expiresAt <= now) throw new BadRequestException(INVALID_REGISTRATION);
    return pending;
  }

  async completeRegistration(token: unknown, dto: WorkshopRegistrationDto, now = new Date()) {
    const pending = await this.previewRegistration(token, now);
    requireWorkshopContact(dto);
    try {
      return await this.prisma.$transaction(async tx => {
        await lockRecipient(tx, 'registro', pending.email);
        const consumed = await tx.googleRegistration.updateMany({
          where: { id: pending.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
        });
        if (consumed.count !== 1) throw new BadRequestException(INVALID_REGISTRATION);
        const { workshop, user } = await createWorkshopOwner(tx, { ...dto, ownerName: pending.ownerName, email: pending.email });
        await tx.googleIdentity.create({ data: { subject: pending.subject, userId: user.id } });
        await tx.pendingRegistration.updateMany({ where: { email: pending.email, usedAt: null }, data: { usedAt: now } });
        const session = await this.sessions.issue(tx, user.id, now);
        const me = {
          user: { id: user.id, name: user.name, email: user.email },
          workshop: { id: workshop.id, name: workshop.name },
          role: 'OWNER', permissions: permissionsFor('OWNER'), googleLinked: true, passwordConfigured: false,
        };
        return { session, me };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          statusCode: 409, code: 'ALREADY_REGISTERED', message: 'Esta cuenta ya está registrada. Iniciá sesión.',
        });
      }
      throw error;
    }
  }

  /**
   * Guarda el vínculo en una transacción que vuelve a comprobar, con bloqueos compartidos (FOR
   * SHARE), que la sesión que inició la vinculación siga vigente y la pertenencia activa. La
   * comprobación del callback ocurre antes de hablar con Google; si en ese intercambio se cierra
   * la sesión, se restablece la contraseña o se da de baja la cuenta, acá se detecta y no se
   * vincula. Si esas operaciones llegan después, esperan a que termine esta transacción
   * (segunda revisión de TS-20). Una cuenta de Google por usuario y un usuario por cuenta.
   */
  private async link(origin: { userId: string; sessionId: string }, subject: string, now: Date) {
    const { userId, sessionId } = origin;
    try {
      await this.prisma.$transaction(async tx => {
        const session = await tx.$queryRaw<{ vigente: boolean }[]>`
          SELECT (revocada_at IS NULL AND expira_at > ${now} AND expira_inactividad_at > ${now}
                  AND usuario_id = ${userId}::uuid) AS vigente
          FROM sesion WHERE id = ${sessionId}::uuid FOR SHARE`;
        if (!session[0]?.vigente) throw new GoogleLoginError('invalid');
        const membership = await tx.$queryRaw<{ status: string }[]>`
          SELECT status::text AS status FROM pertenencia WHERE usuario_id = ${userId}::uuid FOR SHARE`;
        if (membership[0]?.status !== 'ACTIVE') throw new GoogleLoginError('disabled');
        const existing = await tx.googleIdentity.findFirst({ where: { OR: [{ userId }, { subject }] } });
        if (existing) {
          if (existing.userId === userId && existing.subject === subject) return;
          throw new GoogleLoginError('conflict', 'home');
        }
        await tx.googleIdentity.create({ data: { userId, subject } });
      });
    } catch (error) {
      // Vinculación simultánea: si quedó la misma, es inocua; si no, es un conflicto.
      if (!isUniqueViolation(error)) throw error;
      const current = await this.prisma.googleIdentity.findUnique({ where: { userId } });
      if (current?.subject !== subject) throw new GoogleLoginError('conflict', 'home');
    }
  }

  async unlink(userId: string) {
    if (!(await this.accountOptions(userId)).passwordConfigured) {
      throw new ConflictException({ statusCode: 409, code: 'PASSWORD_REQUIRED', message: 'Creá una contraseña antes de desvincular Google.' });
    }
    const removed = await this.prisma.googleIdentity.deleteMany({ where: { userId } });
    if (removed.count === 0) {
      throw new NotFoundException({ statusCode: 404, code: 'NOT_FOUND', message: 'Tu cuenta no tiene Google vinculado.' });
    }
  }

  async accountOptions(userId: string) {
    const [googleLinked, credential] = await Promise.all([
      this.isLinked(userId),
      this.prisma.credential.findUnique({ where: { userId }, select: { emailVerifiedAt: true } }),
    ]);
    return { googleLinked, passwordConfigured: Boolean(credential?.emailVerifiedAt) };
  }
}
