import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Invitation } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../../mail/mail.service';
import { hashToken, newToken } from '../../common/tokens';
import { Access } from '../auth/access';
import { isUniqueViolation, rejectPasswordEqualToEmail } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { AcceptInvitationDto, CreateInvitationDto } from './dto';

export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

const ROLE_NAMES = { OWNER: 'Dueño/Administrador', RECEPTION: 'Recepción', MECHANIC: 'Mecánico' } as const;
const INVALID = {
  statusCode: 400, code: 'INVALID_TOKEN', message: 'La invitación no es válida, ya se usó o venció. Pedile al taller una nueva.',
};
// Mismo mensaje si el email existe en otro taller: quien invita no se entera (decisión 0001, punto 8).
const UNAVAILABLE = {
  statusCode: 409, code: 'INVITATION_UNAVAILABLE',
  message: 'No se puede aceptar esta invitación con ese email. Consultá con el taller que te invitó.',
};

function isPending(invitation: Invitation, now: Date) {
  return !invitation.usedAt && !invitation.revokedAt && invitation.expiresAt > now;
}

function toInvitation(invitation: Invitation) {
  return {
    id: invitation.id, email: invitation.email, role: invitation.role,
    createdAt: invitation.createdAt, expiresAt: invitation.expiresAt,
  };
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async listPending(access: Access, now = new Date()) {
    const invitations = await this.prisma.invitation.findMany({
      where: { workshopId: access.workshopId, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map(toInvitation);
  }

  /** AUTH-03. Una invitación nueva al mismo email reemplaza a la pendiente. */
  async create(access: Access, dto: CreateInvitationDto, now = new Date()) {
    const member = await this.prisma.membership.findFirst({
      where: { workshopId: access.workshopId, user: { email: dto.email } },
    });
    if (member) {
      throw new ConflictException({ statusCode: 409, code: 'ALREADY_MEMBER', message: 'Esa persona ya forma parte del taller.' });
    }
    const token = newToken();
    let invitation: Invitation;
    try {
      invitation = await this.prisma.$transaction(async tx => {
        await tx.invitation.updateMany({
          where: { workshopId: access.workshopId, email: dto.email, usedAt: null, revokedAt: null },
          data: { revokedAt: now },
        });
        return tx.invitation.create({
          data: {
            workshopId: access.workshopId, invitedById: access.userId, email: dto.email, role: dto.role,
            tokenHash: hashToken(token), createdAt: now, expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
          },
        });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new ConflictException({
        statusCode: 409, code: 'CONCURRENT_INVITATION', message: 'Se está creando otra invitación para ese email. Volvé a intentar.',
      });
    }
    const link = `${this.config.appUrl}/invitacion#token=${token}`;
    const emailSent = await this.mail.send({
      to: dto.email,
      subject: `Invitación a ${access.workshopName} · Gestión de talleres`,
      text: `Hola:\n\n${access.name} te invitó a sumarte a ${access.workshopName} con el rol ${ROLE_NAMES[dto.role]}.\n\nPara aceptar, abrí este enlace dentro de las próximas 72 horas:\n${link}\n\nSi no esperabas esta invitación, ignorá este mensaje.`,
    });
    return { ...toInvitation(invitation), emailSent };
  }

  async revoke(access: Access, id: string, now = new Date()) {
    // El filtro por taller hace que un id ajeno responda igual que uno inexistente.
    const revoked = await this.prisma.invitation.updateMany({
      where: { id, workshopId: access.workshopId, usedAt: null, revokedAt: null }, data: { revokedAt: now },
    });
    if (revoked.count !== 1) {
      throw new NotFoundException({ statusCode: 404, code: 'NOT_FOUND', message: 'No encontramos esa invitación pendiente.' });
    }
  }

  async preview(token: string, now = new Date()) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) }, include: { workshop: true },
    });
    if (!invitation || !isPending(invitation, now)) throw new BadRequestException(INVALID);
    return {
      workshopName: invitation.workshop.name, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt,
    };
  }

  /**
   * El taller y el rol salen de la invitación guardada, nunca del pedido.
   * Usuario, credencial, pertenencia y uso de la invitación forman una transacción.
   */
  async accept(dto: AcceptInvitationDto, now = new Date()) {
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash: hashToken(dto.token) } });
    if (!invitation || !isPending(invitation, now)) throw new BadRequestException(INVALID);
    rejectPasswordEqualToEmail(dto.password, invitation.email);
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      await this.prisma.$transaction(async tx => {
        const user = await tx.user.create({ data: { email: invitation.email, name: dto.name } });
        // El enlace llegó a ese buzón: el email queda verificado.
        await tx.credential.create({ data: { userId: user.id, passwordHash, emailVerifiedAt: now } });
        await tx.membership.create({ data: { workshopId: invitation.workshopId, userId: user.id, role: invitation.role } });
        const used = await tx.invitation.updateMany({
          where: { id: invitation.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now, acceptedById: user.id },
        });
        if (used.count !== 1) throw new BadRequestException(INVALID);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(UNAVAILABLE);
      throw error;
    }
  }
}
