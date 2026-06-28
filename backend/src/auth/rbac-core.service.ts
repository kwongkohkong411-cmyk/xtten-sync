import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type Actor = {
  id: string;
  role?: string;
  companyId?: string | null;
  email?: string;
};

export enum AccessScope {
  SELF = 'SELF',
  TEAM = 'TEAM',
  COMPANY = 'COMPANY',
  GLOBAL = 'GLOBAL',
}

export type ActorContext = {
  userId: string;
  username?: string;
  email?: string;
  roleName: string;
  roleId?: string | null;
  companyId?: string | null;
  permissions: Set<string>;
  managedDepartmentIds: string[];
  scope: AccessScope;
};

export enum DecisionReason {
  PUBLIC_ROUTE = 'PUBLIC_ROUTE',
  NO_PERMISSION_REQUIRED = 'NO_PERMISSION_REQUIRED',
  SUPER_ADMIN_BYPASS = 'SUPER_ADMIN_BYPASS',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  COMPANY_SCOPE_GRANTED = 'COMPANY_SCOPE_GRANTED',
  COMPANY_SCOPE_DENIED = 'COMPANY_SCOPE_DENIED',
  TENANT_ACCESS_GRANTED = 'TENANT_ACCESS_GRANTED',
  TENANT_ACCESS_DENIED = 'TENANT_ACCESS_DENIED',
  TEAM_SCOPE_GRANTED = 'TEAM_SCOPE_GRANTED',
  TEAM_SCOPE_DENIED = 'TEAM_SCOPE_DENIED',
  ROLE_ASSIGNMENT_GRANTED = 'ROLE_ASSIGNMENT_GRANTED',
  ROLE_ASSIGNMENT_DENIED = 'ROLE_ASSIGNMENT_DENIED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
}

export type DecisionTrace = {
  allowed: boolean;
  reason: DecisionReason;
  permission?: string;
  scope: AccessScope;
  actor: {
    userId?: string;
    roleName?: string;
    companyId?: string | null;
  };
  resource?: {
    companyId?: string | null;
    ownerUserId?: string | null;
    departmentId?: string | null;
    entityType?: string;
    entityId?: string;
  };
  metadata?: Record<string, unknown>;
};

export type ScopeQueryOptions = {
  requestedCompanyId?: string;
  companyField?: string;
  userField?: string;
  departmentField?: string;
  actorField?: string;
  mode?: 'COMPANY' | 'SELF' | 'SELF_OR_TEAM';
};

const ROLE_HIERARCHY = [
  'SUPER_ADMIN',
  'COMPANY_ADMIN',
  'HR',
  'MANAGER',
  'TEAM_LEAD',
  'AUDITOR',
  'EMPLOYEE',
] as const;

@Injectable()
export class RbacCoreService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly allowDecisionSampleRate = Number(
    process.env.RBAC_ALLOW_AUDIT_SAMPLE_RATE || '0',
  );
  private readonly superAdminOwnerUsername =
    process.env.SUPER_ADMIN_OWNER_USERNAME || 'sn888xt';

  private toJsonObject(
    input: Record<string, unknown> | undefined,
  ): Prisma.InputJsonObject | undefined {
    if (!input) return undefined;
    return input as Prisma.InputJsonObject;
  }

  private toResourceJson(
    input: DecisionTrace['resource'],
  ): Prisma.InputJsonObject | undefined {
    if (!input) return undefined;
    return {
      companyId: input.companyId,
      ownerUserId: input.ownerUserId,
      departmentId: input.departmentId,
      entityType: input.entityType,
      entityId: input.entityId,
    };
  }

  private toPermissionDecisionMeta(
    decision: DecisionTrace,
    permission: string,
    path?: string,
    method?: string,
  ): Prisma.InputJsonObject {
    return {
      permission: decision.permission || permission,
      path,
      method,
      reason: decision.reason,
      actorRole: decision.actor.roleName,
      actorScope: decision.scope,
      resource: this.toResourceJson(decision.resource),
      metadata: this.toJsonObject(decision.metadata),
    };
  }

  private isSuperAdminOwner(context: { username?: string; email?: string }) {
    const username = (context.username || '').trim().toLowerCase();
    return username === this.superAdminOwnerUsername.trim().toLowerCase();
  }

  private normalizePermissionVariants(permission: string) {
    const colon = permission.replace('.', ':');
    const dot = permission.replace(':', '.');
    const [moduleName, action] = dot.split('.');
    const variants = new Set<string>([colon, dot]);

    if ((action === 'read' || action === 'view') && moduleName) {
      variants.add(`${moduleName}:manage`);
      variants.add(`${moduleName}.manage`);
    }

    return variants;
  }

  getRoleHierarchy() {
    return [...ROLE_HIERARCHY];
  }

  isAtLeastRole(roleName: string | undefined, targetRoleName: string) {
    const actualIndex = ROLE_HIERARCHY.indexOf(
      (roleName || 'EMPLOYEE') as (typeof ROLE_HIERARCHY)[number],
    );
    const targetIndex = ROLE_HIERARCHY.indexOf(
      targetRoleName as (typeof ROLE_HIERARCHY)[number],
    );
    if (actualIndex === -1 || targetIndex === -1) return false;
    return actualIndex <= targetIndex;
  }

  private scopeFromRole(roleName: string, companyId?: string | null) {
    if (roleName === 'SUPER_ADMIN') return AccessScope.GLOBAL;
    if (roleName === 'MANAGER' || roleName === 'TEAM_LEAD')
      return AccessScope.TEAM;
    if (companyId) return AccessScope.COMPANY;
    return AccessScope.SELF;
  }

  private buildDecisionTrace(params: {
    allowed: boolean;
    reason: DecisionReason;
    context?: ActorContext;
    permission?: string;
    resource?: DecisionTrace['resource'];
    metadata?: Record<string, unknown>;
  }): DecisionTrace {
    return {
      allowed: params.allowed,
      reason: params.reason,
      permission: params.permission,
      scope: params.context?.scope || AccessScope.SELF,
      actor: {
        userId: params.context?.userId,
        roleName: params.context?.roleName,
        companyId: params.context?.companyId,
      },
      resource: params.resource,
      metadata: params.metadata,
    };
  }

  async resolveActorContext(actor?: Actor): Promise<ActorContext> {
    if (!actor?.id) {
      throw new ForbiddenException('Unauthorized user context');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      include: {
        roleRelation: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        managedDepartments: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!user) {
      throw new ForbiddenException('User context not found');
    }

    const roleName =
      user.roleRelation?.name || user.role || actor.role || 'EMPLOYEE';
    const permissions = new Set<string>();
    for (const rp of user.roleRelation?.permissions || []) {
      const key = rp.permission.key;
      if (!key) continue;
      permissions.add(key);
      permissions.add(key.replace(':', '.'));
    }

    return {
      userId: user.id,
      username: user.username,
      email: user.email,
      roleName,
      roleId: user.roleId,
      companyId: user.companyId ?? actor.companyId,
      permissions,
      managedDepartmentIds: user.managedDepartments.map(
        (department) => department.id,
      ),
      scope: this.scopeFromRole(roleName, user.companyId ?? actor.companyId),
    };
  }

  async can(actor: Actor | ActorContext | undefined, permission: string) {
    const decision = await this.decidePermission(actor, permission);
    return decision.allowed;
  }

  async decidePermission(
    actor: Actor | ActorContext | undefined,
    permission: string,
  ): Promise<DecisionTrace> {
    const context =
      actor && 'permissions' in actor
        ? actor
        : await this.resolveActorContext(actor);

    if (context.roleName === 'SUPER_ADMIN' && this.isSuperAdminOwner(context)) {
      return this.buildDecisionTrace({
        allowed: true,
        reason: DecisionReason.SUPER_ADMIN_BYPASS,
        context,
        permission,
      });
    }

    const allowed = Array.from(
      this.normalizePermissionVariants(permission),
    ).some((variant) => context.permissions.has(variant));
    return this.buildDecisionTrace({
      allowed,
      reason: allowed
        ? DecisionReason.PERMISSION_GRANTED
        : DecisionReason.PERMISSION_DENIED,
      context,
      permission,
    });
  }

  async assertPermission(actor: Actor | undefined, permission: string) {
    const decision = await this.decidePermission(actor, permission);
    if (!decision.allowed) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }
    return decision;
  }

  async assertPlatformAdmin(actor?: Actor) {
    const context = await this.resolveActorContext(actor);
    if (
      context.roleName !== 'SUPER_ADMIN' ||
      !this.isSuperAdminOwner(context)
    ) {
      throw new ForbiddenException(
        `Only designated SUPER_ADMIN (${this.superAdminOwnerUsername}) can perform this action`,
      );
    }
    return context;
  }

  async resolveCompanyScope(
    actor?: Actor,
    requestedCompanyId?: string,
    fallbackToFirstCompany = false,
  ) {
    const context = await this.resolveActorContext(actor);

    if (context.roleName === 'SUPER_ADMIN') {
      if (requestedCompanyId) {
        return requestedCompanyId;
      }

      if (!fallbackToFirstCompany) {
        return undefined;
      }

      const firstCompany = await this.prisma.company.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      if (!firstCompany) {
        throw new NotFoundException('No company found');
      }

      return firstCompany.id;
    }

    if (!context.companyId) {
      throw new ForbiddenException('No company scope in user context');
    }

    if (requestedCompanyId && requestedCompanyId !== context.companyId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    return context.companyId;
  }

  async assertCompanyScope(
    actor?: Actor,
    requestedCompanyId?: string,
    fallbackToFirstCompany = false,
  ) {
    const context = await this.resolveActorContext(actor);

    if (context.roleName === 'SUPER_ADMIN') {
      const companyId =
        requestedCompanyId ||
        (fallbackToFirstCompany
          ? (
              await this.prisma.company.findFirst({
                orderBy: { createdAt: 'asc' },
                select: { id: true },
              })
            )?.id
          : undefined);

      if (!companyId && fallbackToFirstCompany) {
        throw new NotFoundException('No company found');
      }

      return {
        companyId,
        decision: this.buildDecisionTrace({
          allowed: true,
          reason: DecisionReason.COMPANY_SCOPE_GRANTED,
          context,
          resource: { companyId: companyId || null },
        }),
      };
    }

    if (!context.companyId) {
      throw new ForbiddenException('No company scope in user context');
    }

    if (requestedCompanyId && requestedCompanyId !== context.companyId) {
      throw new ForbiddenException(`Cross-tenant access denied`);
    }

    return {
      companyId: context.companyId,
      decision: this.buildDecisionTrace({
        allowed: true,
        reason: DecisionReason.COMPANY_SCOPE_GRANTED,
        context,
        resource: { companyId: context.companyId },
      }),
    };
  }

  async assertCompanyAccess(
    actor: Actor | undefined,
    targetCompanyId?: string | null,
  ) {
    const result = await this.assertTenantAccess(
      actor,
      targetCompanyId || undefined,
    );
    return result.context;
  }

  async assertTenantAccess(actor: Actor | undefined, targetCompanyId?: string) {
    const context = await this.resolveActorContext(actor);

    if (context.roleName === 'SUPER_ADMIN') {
      return {
        context,
        decision: this.buildDecisionTrace({
          allowed: true,
          reason: DecisionReason.TENANT_ACCESS_GRANTED,
          context,
          resource: { companyId: targetCompanyId || context.companyId || null },
        }),
      };
    }

    if (
      !context.companyId ||
      (targetCompanyId && targetCompanyId !== context.companyId)
    ) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    return {
      context,
      decision: this.buildDecisionTrace({
        allowed: true,
        reason: DecisionReason.TENANT_ACCESS_GRANTED,
        context,
        resource: { companyId: targetCompanyId || context.companyId },
      }),
    };
  }

  async assertSelfOrTeam(
    actor: Actor | undefined,
    params: { ownerUserId?: string; departmentId?: string; companyId?: string },
  ) {
    const context = await this.resolveActorContext(actor);

    if (context.roleName === 'SUPER_ADMIN') {
      return {
        context,
        decision: this.buildDecisionTrace({
          allowed: true,
          reason: DecisionReason.SUPER_ADMIN_BYPASS,
          context,
          resource: {
            ownerUserId: params.ownerUserId || null,
            departmentId: params.departmentId || null,
            companyId: params.companyId || context.companyId || null,
          },
        }),
      };
    }

    if (params.ownerUserId && params.ownerUserId === context.userId) {
      return {
        context,
        decision: this.buildDecisionTrace({
          allowed: true,
          reason: DecisionReason.TEAM_SCOPE_GRANTED,
          context,
          resource: {
            ownerUserId: params.ownerUserId,
            departmentId: params.departmentId || null,
            companyId: params.companyId || context.companyId || null,
          },
        }),
      };
    }

    if (
      params.departmentId &&
      context.managedDepartmentIds.includes(params.departmentId)
    ) {
      return {
        context,
        decision: this.buildDecisionTrace({
          allowed: true,
          reason: DecisionReason.TEAM_SCOPE_GRANTED,
          context,
          resource: {
            ownerUserId: params.ownerUserId || null,
            departmentId: params.departmentId,
            companyId: params.companyId || context.companyId || null,
          },
        }),
      };
    }

    throw new ForbiddenException('Self or team scope required');
  }

  async applyScopeToQuery<T extends Record<string, unknown>>(
    actor: Actor | undefined,
    baseWhere: T,
    options: ScopeQueryOptions = {},
  ): Promise<T & Record<string, unknown>> {
    const context = await this.resolveActorContext(actor);
    const companyField = options.companyField || 'companyId';
    const userField = options.userField || 'userId';
    const departmentField = options.departmentField || 'departmentId';

    if (context.roleName === 'SUPER_ADMIN') {
      if (options.requestedCompanyId) {
        return { ...baseWhere, [companyField]: options.requestedCompanyId };
      }
      return { ...baseWhere };
    }

    if (options.mode === 'SELF') {
      return { ...baseWhere, [userField]: context.userId };
    }

    if (options.mode === 'SELF_OR_TEAM') {
      const orFilters: Record<string, unknown>[] = [
        { [userField]: context.userId },
      ];
      if (context.managedDepartmentIds.length) {
        orFilters.push({
          [departmentField]: { in: context.managedDepartmentIds },
        });
      }
      return { ...baseWhere, [companyField]: context.companyId, OR: orFilters };
    }

    if (!context.companyId) {
      throw new ForbiddenException('No company scope in user context');
    }

    return { ...baseWhere, [companyField]: context.companyId };
  }

  async assertAssignableRole(actor: Actor | undefined, roleId: string) {
    const context = await this.resolveActorContext(actor);
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.name === 'SUPER_ADMIN') {
      if (
        context.roleName !== 'SUPER_ADMIN' ||
        !this.isSuperAdminOwner(context)
      ) {
        throw new ForbiddenException(
          `Only designated SUPER_ADMIN (${this.superAdminOwnerUsername}) can grant SUPER_ADMIN role`,
        );
      }
      return role;
    }

    if (context.roleName === 'SUPER_ADMIN' && this.isSuperAdminOwner(context)) {
      return role;
    }

    if (role.name === 'SUPER_ADMIN' || role.name === 'COMPANY_ADMIN') {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can assign platform-level roles',
      );
    }

    return role;
  }

  async recordPermissionDecision(params: {
    actor?: Actor;
    permission: string;
    allowed: boolean;
    reason?: string;
    path?: string;
    method?: string;
    requestedCompanyId?: string;
    decision?: DecisionTrace;
  }) {
    try {
      const context = params.decision?.actor?.userId
        ? await this.resolveActorContext({
            id: params.decision.actor.userId,
            role: params.decision.actor.roleName,
            companyId: params.decision.actor.companyId,
          })
        : params.actor?.id
          ? await this.resolveActorContext(params.actor)
          : undefined;
      const decision =
        params.decision ||
        this.buildDecisionTrace({
          allowed: params.allowed,
          reason: params.allowed
            ? DecisionReason.PERMISSION_GRANTED
            : DecisionReason.PERMISSION_DENIED,
          context,
          permission: params.permission,
          resource: {
            companyId: params.requestedCompanyId || context?.companyId || null,
          },
          metadata: {
            path: params.path,
            method: params.method,
            reasonText: params.reason,
          },
        });
      const companyId =
        decision.resource?.companyId ||
        params.requestedCompanyId ||
        context?.companyId;

      if (!companyId) {
        return;
      }

      if (
        decision.allowed &&
        !(
          this.allowDecisionSampleRate > 0 &&
          Math.random() < this.allowDecisionSampleRate
        )
      ) {
        return;
      }

      await this.prisma.tenantAuditLog.create({
        data: {
          companyId,
          actorId: context?.userId,
          action: decision.allowed ? 'ACCESS_ALLOWED' : 'ACCESS_DENIED',
          scope: 'SECURITY',
          entityType: 'PermissionDecision',
          entityId: params.permission,
          meta: this.toPermissionDecisionMeta(
            decision,
            params.permission,
            params.path,
            params.method,
          ),
        },
      });
    } catch {
      // Permission audit must not break request flow.
    }
  }
}
