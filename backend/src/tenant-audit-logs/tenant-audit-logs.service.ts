import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BaseRbacService } from '../auth/base-rbac.service';
import { Actor, RbacCoreService } from '../auth/rbac-core.service';

@Injectable()
export class TenantAuditLogsService extends BaseRbacService {
  constructor(prisma: PrismaService, rbacCore: RbacCoreService) {
    super(prisma, rbacCore);
  }

  async findAll(actor?: Actor, companyId?: string, limit = 50, scope?: string) {
    const resolvedCompanyId = await this.rbacCore.resolveCompanyScope(
      actor,
      companyId,
      true,
    );
    const context = await this.rbacCore.resolveActorContext(actor);

    return this.prisma.tenantAuditLog.findMany({
      where: {
        companyId: resolvedCompanyId,
        scope: scope || undefined,
        ...(context.roleName === 'SUPER_ADMIN'
          ? {}
          : {
              NOT: {
                actor: {
                  is: {
                    role: 'SUPER_ADMIN',
                  },
                },
              },
            }),
      },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
