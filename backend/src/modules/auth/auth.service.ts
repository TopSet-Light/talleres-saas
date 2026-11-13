import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../../mail/mail.service';
import { EMAILS_PER_RECIPIENT_PER_HOUR, lockRecipient, ONE_HOUR_MS } from '../../common/email-quota';
import { hashToken, newToken } from '../../common/tokens';
import { Access } from './access';
import { CompleteRegistrationDto, LoginDto, RegisterDto } from './dto';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { permissionsFor } from './permissions';
import { SessionService } from './session.service';
import { initializeWorkshopSettings } from '../workshop-settings/numbering.service';

export const REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000;
/** Emails de registro por destinatario y por hora: evita usar el registro para inundar un buzón. */
export const REGISTRATION_EMAILS_PER_HOUR = EMAILS_PER_RECIPIENT_PER_HOUR;

const INVALID_CREDENTIALS = { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos.' };
const INVALID_REGISTRATION = {
  statusCode: 400, code: 'INVALID_TOKEN', message: 'El enlace no es válido, ya se usó o venció. Registrá el taller de nuevo.',
};

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
   * AUTH-01, primer paso. Solo guarda la solicitud y envía el enlace: no crea usuario,
   * taller ni contraseña, así que nadie puede apropiarse de un email ajeno. La respuesta
   * es siempre la misma, exista o no la cuenta. Un nuevo registro no anula los enlaces
   * anteriores; se limita la cantidad de emails por destinatario.
   */
  async register(dto: RegisterDto, now = new Date()) {
    const token = newToken();
    // Verificación del límite y reserva del envío en una sola operación atómica por destinatario.
    const reserved = await this.prisma.$transaction(async tx => {
      await lockRecipient(tx, 'registro', dto.email);
      if (await tx.user.findUnique({ where: { email: dto.email }, select: { id: true } })) return false;
      const recent = await tx.pendingRegistration.count({
        where: { email: dto.email, createdAt: { gt: new Date(now.getTime() - ONE_HOUR_MS) } },
      });
      if (recent >= REGISTRATION_EMAILS_PER_HOUR) return false;
      await tx.pendingRegistration.create({
        data: {
          email: dto.email, workshopName: dto.workshopName, ownerName: dto.ownerName,
          contactPhone: dto.contactPhone ?? null, locality: dto.locality ?? null, address: dto.address ?? null,
          tokenHash: hashToken(token), createdAt: now, expiresAt: new Date(now.getTime() + REGISTRATION_TTL_MS),
        },
      });
      return true;
    });
    if (!reserved) return;
    // El token va en el fragmento (#) para que no llegue a logs ni a otros sitios por Referer.
    const link = `${this.config.appUrl}/verificar-email#token=${token}`;
    await this.mail.send({
      to: dto.email,
      subject: 'Completá el registro de tu taller · Gestión de talleres',
      text: `Hola ${dto.ownerName}:\n\nPara terminar de registrar ${dto.workshopName}, abrí este enlace dentro de las próximas 24 horas y elegí tu contraseña:\n${link}\n\nSi no pediste registrar un taller, ignorá este mensaje: no se creó ninguna cuenta.`,
    });
  }

  private async findPending(token: string, now: Date) {
    const pending = await this.prisma.pendingRegistration.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!pending || pending.usedAt || pending.expiresAt <= now) throw new BadRequestException(INVALID_REGISTRATION);
    return pending;
  }

  async previewRegistration(token: string, now = new Date()) {
    const pending = await this.findPending(token, now);
    return { email: pending.email, workshopName: pending.workshopName, ownerName: pending.ownerName, expiresAt: pending.expiresAt };
  }

  /**
   * AUTH-01, segundo paso. Quien abrió el enlace del buzón elige la contraseña. Taller,
   * dueño, credencial y pertenencia se crean en una transacción y se anulan las demás
   * solicitudes pendientes de ese email.
   */
  async completeRegistration(dto: CompleteRegistrationDto, now = new Date()) {
    const pending = await this.findPending(dto.token, now);
    rejectPasswordEqualToEmail(dto.password, pending.email);
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      await this.prisma.$transaction(async tx => {
        // Condicional: dos usos simultáneos del mismo enlace no pasan ambos.
        const used = await tx.pendingRegistration.updateMany({
          where: { id: pending.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
        });
        if (used.count !== 1) throw new BadRequestException(INVALID_REGISTRATION);
        const workshop = await tx.workshop.create({ data: { name: pending.workshopName } });
        const user = await tx.user.create({ data: { email: pending.email, name: pending.ownerName } });
        await tx.credential.create({ data: { userId: user.id, passwordHash, emailVerifiedAt: now } });
        await tx.membership.create({ data: { workshopId: workshop.id, userId: user.id, role: 'OWNER' } });
        await initializeWorkshopSettings(tx, workshop.id, pending);
        await tx.pendingRegistration.updateMany({ where: { email: pending.email, usedAt: null }, data: { usedAt: now } });
      });
    } catch (error) {
      // Quien llega acá controla el buzón: puede saber que ya tiene una cuenta.
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          statusCode: 409, code: 'ALREADY_REGISTERED', message: 'Ese email ya tiene una cuenta. Iniciá sesión.',
        });
      }
      throw error;
    }
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
    // Defensa adicional: toda credencial nueva nace verificada. La causa se informa solo
    // después de comprobar la contraseña.
    if (!user.credential.emailVerifiedAt) {
      throw new ForbiddenException({
        statusCode: 403, code: 'EMAIL_NOT_VERIFIED', message: 'Tu email no está verificado. Consultá con el soporte.',
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
}
