import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import type { Membership, User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { Access } from '../auth/access';
import { hasPermission } from '../auth/permissions';
import { SessionService } from '../auth/session.service';
import { UpdateEmployeeDto } from './dto';

const NOT_FOUND = { statusCode: 404, code: 'NOT_FOUND', message: 'No encontramos ese empleado en tu taller.' };
const FORBIDDEN = { statusCode: 403, code: 'FORBIDDEN', message: 'No tenés permiso para realizar esta acción.' };

function toEmployee(membership: Membership & { user: User }, access: Access) {
  return {
    id: membership.id,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    status: membership.status,
    createdAt: membership.createdAt,
    isCurrentUser: membership.id === access.membershipId,
  };
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService, private readonly sessions: SessionService) {}

  async list(access: Access) {
    const memberships = await this.prisma.membership.findMany({
      where: { workshopId: access.workshopId },
      include: { user: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
    return memberships.map(membership => toEmployee(membership, access));
  }

  /** AUTH-04 y AUTH-06: cambio de rol, baja y reactivación dentro del propio taller. */
  async update(access: Access, id: string, dto: UpdateEmployeeDto) {
    if (!dto.role && !dto.status) {
      throw new BadRequestException({
        statusCode: 400, code: 'VALIDATION_ERROR', message: 'Indicá el rol o el estado a cambiar.', fields: {},
      });
    }
    if (dto.status && !hasPermission(access.role, 'employees.deactivate')) throw new ForbiddenException(FORBIDDEN);
    if (id === access.membershipId) {
      throw new ConflictException({
        statusCode: 409, code: 'SELF_CHANGE', message: 'No podés cambiar tu propio rol ni desactivar tu acceso.',
      });
    }
    return this.prisma.$transaction(async tx => {
      // Serializa los cambios del taller: dos dueños no pueden quitarse el rol en simultáneo.
      await tx.$queryRaw`SELECT id FROM taller WHERE id = ${access.workshopId}::uuid FOR UPDATE`;
      const actor = await tx.membership.findUnique({ where: { id: access.membershipId } });
      if (!actor || actor.status !== 'ACTIVE' || !hasPermission(actor.role, 'employees.changeRole')) {
        throw new ForbiddenException(FORBIDDEN);
      }
      // Buscar por id y taller: un id de otro taller responde igual que uno inexistente.
      const target = await tx.membership.findFirst({ where: { id, workshopId: access.workshopId } });
      if (!target) throw new NotFoundException(NOT_FOUND);
      const role = dto.role ?? target.role;
      const status = dto.status ?? target.status;
      if (target.role === 'OWNER' && target.status === 'ACTIVE' && (role !== 'OWNER' || status !== 'ACTIVE')) {
        const owners = await tx.membership.count({
          where: { workshopId: access.workshopId, role: 'OWNER', status: 'ACTIVE', id: { not: target.id } },
        });
        if (owners === 0) {
          throw new ConflictException({
            statusCode: 409, code: 'LAST_OWNER', message: 'El taller debe conservar al menos un dueño activo.',
          });
        }
      }
      const updated = await tx.membership.update({
        where: { id: target.id }, data: { role, status }, include: { user: true },
      });
      // La baja corta también las sesiones abiertas.
      if (status === 'INACTIVE') await this.sessions.revokeAllForUser(tx, target.userId);
      return toEmployee(updated, access);
    });
  }
}
