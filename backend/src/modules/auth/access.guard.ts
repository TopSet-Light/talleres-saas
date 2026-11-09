import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SESSION_COOKIE } from '../../common/session-cookie';
import { AccessRequest, PERMISSION_KEY } from './access';
import { hasPermission, Permission } from './permissions';
import { SessionService } from './session.service';

/** Exige una sesión válida y, si la ruta lo declara, un permiso de la matriz. */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly sessions: SessionService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AccessRequest>();
    const access = await this.sessions.resolve(request.cookies?.[SESSION_COOKIE]);
    if (!access) {
      throw new UnauthorizedException({
        statusCode: 401, code: 'UNAUTHENTICATED', message: 'Tu sesión venció o no es válida. Iniciá sesión de nuevo.',
      });
    }
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (permission && !hasPermission(access.role, permission)) {
      throw new ForbiddenException({
        statusCode: 403, code: 'FORBIDDEN', message: 'No tenés permiso para realizar esta acción.',
      });
    }
    request.access = access;
    return true;
  }
}
