import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertTenantConfigDto } from './dto/upsert-tenant-config.dto';
import { BaseRbacService } from '../auth/base-rbac.service';
import { Actor, RbacCoreService } from '../auth/rbac-core.service';

@Injectable()
export class TenantConfigService extends BaseRbacService {
  constructor(prisma: PrismaService, rbacCore: RbacCoreService) {
    super(prisma, rbacCore);
  }

  private async resolveRequiredCompanyId(
    actor: Actor,
    requestedCompanyId?: string,
  ) {
    const companyId = await this.rbacCore.resolveCompanyScope(
      actor,
      requestedCompanyId,
      true,
    );
    if (!companyId) {
      throw new NotFoundException('No company found');
    }
    return companyId;
  }

  private requireActor(actor?: Actor) {
    if (!actor) {
      throw new ForbiddenException('Unauthorized');
    }

    return actor;
  }

  async getConfig(actor: Actor | undefined, companyId?: string) {
    actor = this.requireActor(actor);
    const resolvedCompanyId = await this.resolveRequiredCompanyId(
      actor,
      companyId,
    );

    const company = await this.prisma.company.findUnique({
      where: { id: resolvedCompanyId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const config = await this.prisma.tenantConfig.findUnique({
      where: { companyId: resolvedCompanyId },
    });

    if (config) {
      return config;
    }

    return this.prisma.tenantConfig.create({
      data: { companyId: resolvedCompanyId },
    });
  }

  async upsertConfig(actor: Actor | undefined, dto: UpsertTenantConfigDto) {
    actor = this.requireActor(actor);
    const resolvedCompanyId = await this.resolveRequiredCompanyId(
      actor,
      dto.companyId,
    );

    const before = await this.prisma.tenantConfig.findUnique({
      where: { companyId: resolvedCompanyId },
    });

    const updated = await this.prisma.tenantConfig.upsert({
      where: { companyId: resolvedCompanyId },
      update: {
        isolationLevel: dto.isolationLevel,
        allowCrossTenantReporting: dto.allowCrossTenantReporting,
        enforceSso: dto.enforceSso,
        defaultUserLimit: dto.defaultUserLimit,
        defaultStorageGb: dto.defaultStorageGb,
        trialDays: dto.trialDays,
      },
      create: {
        companyId: resolvedCompanyId,
        isolationLevel: dto.isolationLevel || 'STRICT',
        allowCrossTenantReporting: dto.allowCrossTenantReporting ?? false,
        enforceSso: dto.enforceSso ?? false,
        defaultUserLimit: dto.defaultUserLimit ?? 100,
        defaultStorageGb: dto.defaultStorageGb ?? 20,
        trialDays: dto.trialDays ?? 14,
      },
    });

    await this.prisma.tenantAuditLog.create({
      data: {
        companyId: resolvedCompanyId,
        actorId: actor.id,
        action: 'TENANT_RUNTIME_CONFIG_UPDATED',
        scope: 'RUNTIME',
        entityType: 'TenantConfig',
        entityId: updated.id,
        beforeData: before ?? undefined,
        afterData: updated,
      },
    });

    return updated;
  }
}
