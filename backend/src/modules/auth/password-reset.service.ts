import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { EMAILS_PER_RECIPIENT_PER_HOUR, lockRecipient, ONE_HOUR_MS } from '../../common/email-quota';
import { hashToken, newToken } from '../../common/tokens';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../../mail/mail.service';
import { rejectPasswordEqualToEmail } from './auth.service';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const INVALID_RESET = {
  statusCode: 400, code: 'INVALID_TOKEN', message: 'El enlace no es válido, ya se usó o venció. Pedí uno nuevo.',
};

/**
 * AUTH-05. El enlace vence en una hora, es de un solo uso y se guarda solo como hash.
 * La solicitud responde igual para emails registrados y desconocidos. Restablecer la
 * contraseña revoca todas las sesiones y anula los demás enlaces pendientes.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly attempts: LoginAttemptsService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async request(email: string, now = new Date()) {
    const token = newToken();
    // Límite por destinatario verificado y reservado de forma atómica, como en el registro.
    const user = await this.prisma.$transaction(async tx => {
      await lockRecipient(tx, 'recuperacion', email);
      const found = await tx.user.findUnique({ where: { email }, select: { id: true, name: true } });
      if (!found) return null;
      const recent = await tx.passwordReset.count({
        where: { userId: found.id, createdAt: { gt: new Date(now.getTime() - ONE_HOUR_MS) } },
      });
      if (recent >= EMAILS_PER_RECIPIENT_PER_HOUR) return null;
      await tx.passwordReset.create({
        data: { userId: found.id, tokenHash: hashToken(token), createdAt: now, expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS) },
      });
      return found;
    });
    if (!user) return;
    // El token va en el fragmento (#) para que no llegue a logs ni a otros sitios por Referer.
    const link = `${this.config.appUrl}/restablecer-contrasena#token=${token}`;
    await this.mail.send({
      to: email,
      subject: 'Recuperá tu contraseña · Gestión de talleres',
      text: `Hola ${user.name}:\n\nPara elegir una contraseña nueva, abrí este enlace dentro de la próxima hora:\n${link}\n\nAl cambiarla se cierran todas tus sesiones abiertas.\nSi no pediste recuperar la contraseña, ignorá este mensaje: tu contraseña actual sigue siendo válida.`,
    });
  }

  private async findValid(token: string, now: Date) {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(token) }, include: { user: { select: { email: true } } },
    });
    if (!reset || reset.usedAt || reset.expiresAt <= now) throw new BadRequestException(INVALID_RESET);
    return reset;
  }

  async preview(token: string, now = new Date()) {
    const reset = await this.findValid(token, now);
    return { email: reset.user.email, expiresAt: reset.expiresAt };
  }

  async reset(token: string, password: string, now = new Date()) {
    const reset = await this.findValid(token, now);
    rejectPasswordEqualToEmail(password, reset.user.email);
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async tx => {
      // Condicional: dos usos simultáneos del mismo enlace no pasan ambos.
      const used = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
      });
      if (used.count !== 1) throw new BadRequestException(INVALID_RESET);
      // Abrir el enlace prueba el control del buzón: el email queda verificado.
      await tx.credential.upsert({
        where: { userId: reset.userId },
        create: { userId: reset.userId, passwordHash, emailVerifiedAt: now },
        update: { passwordHash, emailVerifiedAt: now },
      });
      await tx.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: now } });
      await this.sessions.revokeAllForUser(tx, reset.userId, now);
    });
    this.attempts.reset(reset.user.email);
  }
}
