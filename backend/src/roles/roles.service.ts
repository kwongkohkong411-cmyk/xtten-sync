import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BaseRbacService } from '../auth/base-rbac.service';
import { Actor, RbacCoreService } from '../auth/rbac-core.service';

type RoleCreateInput = {
  name: string;
  description?: string;
  permissionIds?: string[];
};

type RoleUpdateInput = {
  name?: string;
  description?: string;
  permissionIds?: string[];
};

@Injectable()
export class RolesService extends BaseRbacService {
  constructor(prisma: PrismaService, rbacCore: RbacCoreService) {
    super(prisma, rbacCore);
  }

  async init(actor?: Actor) {
    await this.rbacCore.assertPlatformAdmin(actor);

    const roles = [
      {
        name: 'SUPER_ADMIN',
        description: 'Full platform access',
        isSystem: true,
      },
      {
        name: 'COMPANY_ADMIN',
        description: 'Manage one company',
        isSystem: true,
      },
      {
        name: 'HR',
        description: 'Manage employees and attendance',
        isSystem: true,
      },
      { name: 'MANAGER', description: 'Department manager', isSystem: true },
      { name: 'TEAM_LEAD', description: 'Team lead', isSystem: true },
      { name: 'AUDITOR', description: 'Read-only audit role', isSystem: true },
      { name: 'EMPLOYEE', description: 'Basic employee', isSystem: true },
    ];

    for (const role of roles) {
      // 查找系统角色（companyId = null）
      let existingRole = await this.prisma.role.findFirst({
        where: { name: role.name, companyId: null },
      });

      if (!existingRole) {
        await this.prisma.role.create({
          data: { ...role, companyId: null },
        });
      } else {
        await this.prisma.role.update({
          where: { id: existingRole.id },
          data: role,
        });
      }
    }

    return { message: 'Default roles initialized' };
  }

  async findAll(actor?: Actor) {
    const { roleName, companyId } = await this.resolveActorContext(actor);

    const where =
      roleName === 'SUPER_ADMIN'
        ? undefined
        : {
            AND: [
              { name: { not: 'SUPER_ADMIN' } },
              {
                OR: [{ companyId: null }, { companyId: companyId || '__never__' }],
              },
            ],
          };

    return this.prisma.role.findMany({
      where,
      include: {
        users:
          roleName === 'SUPER_ADMIN'
            ? true
            : {
                where: companyId ? { companyId } : { id: '__never__' },
              },
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async create(body: RoleCreateInput, actor?: Actor) {
    const { roleName, companyId } = await this.resolveActorContext(actor);

    if (roleName !== 'SUPER_ADMIN' && !companyId) {
      throw new ForbiddenException('Company context required');
    }

    return this.prisma.role.create({
      data: {
        name: body.name,
        description: body.description,
        isSystem: false,
        isCustom: true,
        companyId: companyId ?? null,
        permissions: body.permissionIds
          ? {
              create: body.permissionIds.map((permissionId: string) => ({
                permissionId,
              })),
            }
          : undefined,
      },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
  }

  async update(id: string, body: RoleUpdateInput, actor?: Actor) {
    const { roleName, companyId } = await this.resolveActorContext(actor);

    const current = await this.prisma.role.findUnique({
      where: { id },
      select: { name: true, isSystem: true, companyId: true },
    });

    if (!current) {
      throw new BadRequestException('Role not found');
    }

    if (current.isSystem) {
      throw new BadRequestException('System role cannot be edited');
    }

    if (roleName !== 'SUPER_ADMIN' && current.companyId !== companyId) {
      throw new ForbiddenException('Cross-company role update is not allowed');
    }

    if (current.isSystem && body.name && body.name !== current.name) {
      throw new BadRequestException('System role name cannot be changed');
    }

    const permissionUpdates: {
      permissions?: {
        deleteMany: Record<string, never>;
        create: { permissionId: string }[];
      };
    } = {};

    if (body.permissionIds) {
      permissionUpdates.permissions = {
        deleteMany: {},
        create: body.permissionIds.map((permissionId: string) => ({
          permissionId,
        })),
      };
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        ...permissionUpdates,
      },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
  }

  async remove(id: string, actor?: Actor) {
    const { roleName, companyId } = await this.resolveActorContext(actor);

    const role = await this.prisma.role.findUnique({
      where: { id },
    });

    if (!role) {
      throw new BadRequestException('Role not found');
    }

    if (role.isSystem) {
      throw new BadRequestException('System role cannot be deleted');
    }

    if (roleName !== 'SUPER_ADMIN' && role.companyId !== companyId) {
      throw new ForbiddenException('Cross-company role deletion is not allowed');
    }

    return this.prisma.role.delete({
      where: { id },
    });
  }
}
