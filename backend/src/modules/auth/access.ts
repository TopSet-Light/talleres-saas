import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import type { Permission } from './permissions';

/** Contexto resuelto desde la sesión. Es la única fuente de taller y rol. */
export interface Access {
  sessionId: string;
  userId: string;
  name: string;
  email: string;
  membershipId: string;
  workshopId: string;
  workshopName: string;
  role: Role;
}

export type AccessRequest = Request & { access?: Access };

export const PERMISSION_KEY = 'requiredPermission';
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);

export const CurrentAccess = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const access = context.switchToHttp().getRequest<AccessRequest>().access;
  // Solo se usa detrás de AccessGuard; si falta, es un error de programación.
  if (!access) throw new Error('CurrentAccess requiere AccessGuard');
  return access;
});
