import { PrismaService } from '../prisma/prisma.service';
import {
  Actor,
  ActorContext,
  DecisionTrace,
  RbacCoreService,
  ScopeQueryOptions,
} from './rbac-core.service';

export abstract class BaseRbacService {
  protected constructor(
    protected readonly prisma: PrismaService,
    protected readonly rbacCore: RbacCoreService,
  ) {}

  protected resolveActorContext(actor?: Actor): Promise<ActorContext> {
    return this.rbacCore.resolveActorContext(actor);
  }

  protected resolveCompanyScope(
    actor?: Actor,
    requestedCompanyId?: string,
    fallbackToFirstCompany = false,
  ) {
    return this.rbacCore.resolveCompanyScope(
      actor,
      requestedCompanyId,
      fallbackToFirstCompany,
    );
  }

  protected assertCompanyScope(
    actor?: Actor,
    requestedCompanyId?: string,
    fallbackToFirstCompany = false,
  ) {
    return this.rbacCore.assertCompanyScope(
      actor,
      requestedCompanyId,
      fallbackToFirstCompany,
    );
  }

  protected assertTenantAccess(
    actor: Actor | undefined,
    targetCompanyId?: string,
  ) {
    return this.rbacCore.assertTenantAccess(actor, targetCompanyId);
  }

  protected assertPermission(actor: Actor | undefined, permission: string) {
    return this.rbacCore.assertPermission(actor, permission);
  }

  protected applyScopeToQuery<T extends Record<string, unknown>>(
    actor: Actor | undefined,
    baseWhere: T,
    options: ScopeQueryOptions = {},
  ): Promise<T & Record<string, unknown>> {
    return this.rbacCore.applyScopeToQuery(actor, baseWhere, options);
  }

  protected recordPermissionDecision(params: {
    actor?: Actor;
    permission: string;
    allowed: boolean;
    reason?: string;
    path?: string;
    method?: string;
    requestedCompanyId?: string;
    decision?: DecisionTrace;
  }) {
    return this.rbacCore.recordPermissionDecision(params);
  }
}
