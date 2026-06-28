import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { BaseRbacService } from '../auth/base-rbac.service';
import { Actor, RbacCoreService } from '../auth/rbac-core.service';

type CompanyUserSnapshot = {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  role: string | null;
  roleId: string | null;
  status: string;
  createdAt: string;
  roleRelation: {
    id: string;
    name: string;
  } | null;
};

type CompanyAuditSnapshot = {
  id: string;
  name: string;
  code: string;
  country: string | null;
  timezone: string | null;
  logo: string | null;
  plan: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  users?: CompanyUserSnapshot[];
};

@Injectable()
export class CompaniesService extends BaseRbacService {
  constructor(prisma: PrismaService, rbacCore: RbacCoreService) {
    super(prisma, rbacCore);
  }

  private toCompanyUserSnapshot(user: {
    id: string;
    email: string;
    username: string | null;
    name: string | null;
    role: string | null;
    roleId: string | null;
    status: string;
    createdAt: Date;
    roleRelation?: {
      id: string;
      name: string;
    } | null;
  }): CompanyUserSnapshot {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      role: user.role,
      roleId: user.roleId,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      roleRelation: user.roleRelation
        ? {
            id: user.roleRelation.id,
            name: user.roleRelation.name,
          }
        : null,
    };
  }

  private toCompanyAuditSnapshot(company: {
    id: string;
    name: string;
    code: string;
    country: string | null;
    timezone: string | null;
    logo: string | null;
    plan: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    users?: Array<{
      id: string;
      email: string;
      username: string | null;
      name: string | null;
      role: string | null;
      roleId: string | null;
      status: string;
      createdAt: Date;
      roleRelation?: {
        id: string;
        name: string;
      } | null;
    }>;
  }): Prisma.InputJsonObject {
    const snapshot: CompanyAuditSnapshot = {
      id: company.id,
      name: company.name,
      code: company.code,
      country: company.country,
      timezone: company.timezone,
      logo: company.logo,
      plan: company.plan,
      status: company.status,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };

    if (company.users) {
      snapshot.users = company.users.map((user) =>
        this.toCompanyUserSnapshot(user),
      );
    }

    return snapshot;
  }

  async create(dto: CreateCompanyDto, actor?: Actor) {
    await this.rbacCore.assertPlatformAdmin(actor);

    const created = await this.prisma.company.create({
      data: {
        name: dto.name,
        code: dto.code,
        country: dto.country,
        timezone: dto.timezone || 'Asia/Shanghai',
        logo: dto.logo,
        plan: dto.plan || 'FREE',
        status: dto.status || 'ACTIVE',
      },
    });

    await this.prisma.tenantAuditLog.create({
      data: {
        companyId: created.id,
        actorId: actor?.id,
        action: 'TENANT_COMPANY_CREATED',
        scope: 'CORE',
        entityType: 'Company',
        entityId: created.id,
        afterData: this.toCompanyAuditSnapshot(created),
      },
    });

    return created;
  }

  async findAll(actor?: Actor) {
    const where = await this.rbacCore.applyScopeToQuery(
      actor,
      {},
      { companyField: 'id' },
    );

    return this.prisma.company.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            role: true,
            roleId: true,
            status: true,
            createdAt: true,
            roleRelation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async findOne(id: string, actor?: Actor) {
    await this.rbacCore.assertTenantAccess(actor, id);

    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            role: true,
            roleId: true,
            status: true,
            createdAt: true,
            roleRelation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  async update(id: string, dto: UpdateCompanyDto, actor?: Actor) {
    await this.rbacCore.assertTenantAccess(actor, id);

    const before = await this.findOne(id, actor);

    const updated = await this.prisma.company.update({
      where: { id },
      data: dto,
    });

    await this.prisma.tenantAuditLog.create({
      data: {
        companyId: id,
        actorId: actor?.id,
        action: 'TENANT_CORE_PROFILE_UPDATED',
        scope: 'CORE',
        entityType: 'Company',
        entityId: id,
        beforeData: this.toCompanyAuditSnapshot(before),
        afterData: this.toCompanyAuditSnapshot(updated),
      },
    });

    return updated;
  }

  async remove(id: string, actor?: Actor) {
    await this.rbacCore.assertPlatformAdmin(actor);
    const before = await this.findOne(id, actor);

    const removed = await this.prisma.company.delete({
      where: { id },
    });

    await this.prisma.tenantAuditLog.create({
      data: {
        companyId: id,
        actorId: actor?.id,
        action: 'TENANT_COMPANY_DELETED',
        scope: 'CORE',
        entityType: 'Company',
        entityId: id,
        beforeData: this.toCompanyAuditSnapshot(before),
        afterData: this.toCompanyAuditSnapshot(removed),
      },
    });

    return removed;
  }
}
