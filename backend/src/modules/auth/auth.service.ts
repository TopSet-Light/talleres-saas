import {
  BadRequestException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../../mail/mail.service';
import { hashToken, newToken } from '../../common/tokens';
import { Access } from './access';
import { LoginDto, RegisterDto } from './dto';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { permissionsFor } from './permissions';
import { SessionService } from './session.service';

export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const INVALID_CREDENTIALS = { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos.' };
const INVALID_VERIFICATION = { statusCode: 400, code: 'INVALID_TOKEN', message: 'El enlace no es válido o venció. Pedí uno nuevo.' };

export function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function rejectPasswordEqualToEmail(password: string, email: string) {
  if (password.trim().toLowerCase() === email) {
    throw new BadRequestException({
      statusCode: 400, code: 'VALIDATION_ERROR', message: 'Revisá los datos ingresados.',
      fields: { password: 'La contraseña no puede ser igual al email.' },
    });
  }
}

export function toMe(access: Access) {
  return {
    user: { id: access.userId, name: access.name, email: access.email },
    workshop: { id: access.workshopId, name: access.workshopName },
    role: access.role,
    permissions: permissionsFor(access.role),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly attempts: LoginAttemptsService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * AUTH-01. Taller, dueño, credencial, pertenencia y verificación se crean en
   * una transacción. Si el email ya existe no se crea nada y la respuesta es la
   * misma, para no revelar qué emails están registrados.
   */
  async register(dto: RegisterDto) {
    rejectPasswordEqualToEmail(dto.password, dto.email);
    const passwordHash = await this.passwords.hash(dto.password);
    const token = newToken();
    try {
      await this.prisma.$transaction(async tx => {
        const workshop = await tx.workshop.create({ data: { name: dto.workshopName } });
        const user = await tx.user.create({ data: { email: dto.email, name: dto.ownerName } });
        await tx.credential.create({ data: { userId: user.id, passwordHash } });
        await tx.membership.create({ data: { workshopId: workshop.id, userId: user.id, role: 'OWNER' } });
        await tx.emailVerification.create({
          data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS) },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) return;
      throw error;
    }
    await this.sendVerification(dto.email, dto.ownerName, token);
  }

  async verifyEmail(token: string, now = new Date()) {
    const verification = await this.prisma.emailVerification.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!verification || verification.usedAt || verification.expiresAt <= now) {
      throw new BadRequestException(INVALID_VERIFICATION);
    }
    await this.prisma.$transaction(async tx => {
      // Condicional: dos usos simultáneos del mismo enlace no pasan ambos.
      const used = await tx.emailVerification.updateMany({
        where: { id: verification.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
      });
      if (used.count !== 1) throw new BadRequestException(INVALID_VERIFICATION);
      await tx.credential.updateMany({
        where: { userId: verification.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now },
      });
    });
  }

  /** Siempre responde igual. Solo envía si la cuenta existe y falta verificarla. */
  async resendVerification(email: string, now = new Date()) {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { credential: true } });
    if (!user?.credential || user.credential.emailVerifiedAt) return;
    const token = newToken();
    await this.prisma.$transaction(async tx => {
      // Los enlaces anteriores quedan inutilizables.
      await tx.emailVerification.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
      await tx.emailVerification.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS) },
      });
    });
    await this.sendVerification(user.email, user.name, token);
  }

  /** AUTH-02. Devuelve el token para la cookie; nunca se incluye en el cuerpo. */
  async login(dto: LoginDto) {
    if (this.attempts.isBlocked(dto.email)) {
      throw new HttpException({
        statusCode: 429, code: 'TOO_MANY_ATTEMPTS',
        message: 'Demasiados intentos fallidos. Esperá unos minutos y volvé a intentar.',
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email }, include: { credential: true, membership: true },
    });
    const valid = user?.credential
      ? await this.passwords.verify(dto.password, user.credential.passwordHash)
      : await this.passwords.verifyDummy(dto.password);
    if (!user?.credential || !valid) {
      this.attempts.recordFailure(dto.email);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    // La causa se informa solo después de comprobar la contraseña.
    if (!user.credential.emailVerifiedAt) {
      throw new ForbiddenException({
        statusCode: 403, code: 'EMAIL_NOT_VERIFIED', message: 'Verificá tu email antes de iniciar sesión. Revisá tu bandeja de entrada.',
      });
    }
    if (!user.membership || user.membership.status !== 'ACTIVE') {
      throw new ForbiddenException({
        statusCode: 403, code: 'ACCESS_DISABLED', message: 'Tu acceso al taller está desactivado. Consultá con el dueño del taller.',
      });
    }
    this.attempts.reset(dto.email);
    const session = await this.sessions.create(user.id);
    const access = await this.sessions.resolve(session.token);
    if (!access) throw new UnauthorizedException(INVALID_CREDENTIALS);
    return { ...session, me: toMe(access) };
  }

  private async sendVerification(email: string, name: string, token: string) {
    // El token va en el fragmento (#) para que no llegue a logs ni a otros sitios por Referer.
    const link = `${this.config.appUrl}/verificar-email#token=${token}`;
    await this.mail.send({
      to: email,
      subject: 'Verificá tu email · Gestión de talleres',
      text: `Hola ${name}:\n\nPara activar tu cuenta, abrí este enlace dentro de las próximas 24 horas:\n${link}\n\nSi no creaste una cuenta, ignorá este mensaje.`,
    });
  }
}
