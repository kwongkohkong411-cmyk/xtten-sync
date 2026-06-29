import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSION_KEY } from './permissions.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RbacCoreService } from './rbac-core.service';

type GuardUser = { id: string; role?: string; companyId?: string | null };

type RequestContext = {
  user?: GuardUser;
  route?: { path?: string };
  url?: string;
  method?: string;
  headers?: Record<string, unknown>;
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacCore: RbacCoreService,
  ) {}

  private headerToString(input: unknown) {
    return typeof input === 'string' && input.length > 0 ? input : undefined;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermission = this.reflector.getAllAndOverride<string | string[]>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    const user = request.user;

    if (!user?.id) {
      throw new ForbiddenException('Unauthorized user context');
    }

    const requiredPermissions = Array.isArray(requiredPermission)
      ? requiredPermission
      : [requiredPermission];

    let decision:
      | Awaited<ReturnType<RbacCoreService['decidePermission']>>
      | undefined;

    for (const permission of requiredPermissions) {
      const currentDecision = await this.rbacCore.decidePermission(user, permission);
      if (currentDecision.allowed) {
        decision = currentDecision;
        break;
      }
      decision = currentDecision;
    }

    if (!decision) {
      throw new ForbiddenException('Permission decision unavailable');
    }

    const path = request.route?.path || request.url;
    const method = request.method;
    const requestedCompanyId =
      this.headerToString(request.headers?.companyid) ||
      this.headerToString(request.headers?.['x-company-id']);

    const decisionResource =
      decision.resource && typeof decision.resource === 'object'
        ? (decision.resource as Record<string, unknown>)
        : {};

    const decisionMetadata =
      decision.metadata && typeof decision.metadata === 'object'
        ? decision.metadata
        : {};

    await this.rbacCore.recordPermissionDecision({
      actor: user,
      permission: requiredPermissions.join(' | '),
      allowed: decision.allowed,
      path,
      method,
      requestedCompanyId,
      decision: {
        ...decision,
        resource: {
          ...decisionResource,
          companyId:
            this.headerToString(decisionResource.companyId) ||
            requestedCompanyId ||
            user?.companyId ||
            null,
        },
        metadata: {
          ...decisionMetadata,
          path,
          method,
        },
      },
    });

    if (!decision.allowed) {
      throw new ForbiddenException(
        `Missing permission: ${requiredPermissions.join(' or ')}`,
      );
    }

    return true;
  }
}
