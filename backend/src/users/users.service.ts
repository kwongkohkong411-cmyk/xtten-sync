import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import bcrypt from 'bcrypt';
import { BaseRbacService } from '../auth/base-rbac.service';
import { Actor, RbacCoreService } from '../auth/rbac-core.service';

type UserCreateInput = {
  email: string;
  username: string;
  password: string;
  name: string;
  roleId?: string;
  status?: string;
  companyId?: string;
};

type UserUpdateInput = {
  email?: string;
  username?: string;
  password?: string;
  name?: string;
  roleId?: string;
  status?: string;
  companyId?: string;
};

@Injectable()
export class UsersService extends BaseRbacService {
  private readonly superAdminOwnerUsername = (
    process.env.SUPER_ADMIN_OWNER_USERNAME || 'sn888xt'
  )
    .trim()
    .toLowerCase();

  constructor(prisma: PrismaService, rbacCore: RbacCoreService) {
    super(prisma, rbacCore);
  }

  private async assertUserInScope(id: string, actor?: Actor) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { companyId: true },
    });

    if (!target) {
      return;
    }

    await this.rbacCore.assertTenantAccess(
      actor,
      target.companyId || undefined,
    );
  }

  async findAll(actor?: Actor) {
    const where = await this.rbacCore.applyScopeToQuery(actor, {});

    return this.prisma.user.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        company: true,
        roleRelation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findByCompany(companyId: string, actor?: Actor) {
    const { companyId: scopedCompanyId } =
      await this.rbacCore.assertCompanyScope(actor, companyId);

    return this.prisma.user.findMany({
      where: { companyId: scopedCompanyId },
      orderBy: { createdAt: 'desc' },
      include: {
        company: true,
        roleRelation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  private async resolveRoleName(roleId?: string, fallback = 'EMPLOYEE') {
    if (!roleId) {
      return fallback;
    }

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    });

    return role?.name ?? fallback;
  }

  private async resolveRoleAssignment(
    roleId?: string,
    actor?: Actor,
    fallback = 'EMPLOYEE',
  ) {
    if (!roleId) {
      const context = await this.resolveActorContext(actor);
      if (
        context.roleName !== 'SUPER_ADMIN' &&
        (fallback === 'SUPER_ADMIN' || fallback === 'COMPANY_ADMIN')
      ) {
        throw new ForbiddenException(
          'Only SUPER_ADMIN can assign platform-level roles',
        );
      }
      return {
        roleId: null,
        roleName: fallback,
      };
    }

    const role = await this.rbacCore.assertAssignableRole(actor, roleId);

    return {
      roleId: role.id,
      roleName: role.name,
    };
  }

  private assertSuperAdminOwnershipRule(
    targetUsername: string | undefined,
    nextRoleName: string,
  ) {
    const username = (targetUsername || '').trim().toLowerCase();

    if (
      nextRoleName === 'SUPER_ADMIN' &&
      username !== this.superAdminOwnerUsername
    ) {
      throw new ForbiddenException(
        `Only ${this.superAdminOwnerUsername} can hold SUPER_ADMIN role`,
      );
    }

    if (
      username === this.superAdminOwnerUsername &&
      nextRoleName !== 'SUPER_ADMIN'
    ) {
      throw new ForbiddenException(
        'Designated SUPER_ADMIN owner account cannot be downgraded',
      );
    }
  }

  async create(data: UserCreateInput, actor?: Actor) {
    if (data.companyId) {
      const { companyId } = await this.rbacCore.assertCompanyScope(
        actor,
        data.companyId,
      );
      data.companyId = companyId;
    } else {
      const scopedCompanyId = await this.rbacCore.resolveCompanyScope(actor);
      if (scopedCompanyId) {
        data.companyId = scopedCompanyId;
      }
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const roleAssignment = await this.resolveRoleAssignment(
      data.roleId,
      actor,
      'EMPLOYEE',
    );
    this.assertSuperAdminOwnershipRule(data.username, roleAssignment.roleName);

    return this.prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        password: hashedPassword,
        name: data.name,
        role: roleAssignment.roleName,
        roleId: roleAssignment.roleId,
        status: data.status || 'ACTIVE',
        companyId: data.companyId || null,
      },
      include: {
        company: true,
        roleRelation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async update(id: string, data: UserUpdateInput, actor?: Actor) {
    await this.assertUserInScope(id, actor);

    if (data.companyId) {
      const { companyId } = await this.rbacCore.assertCompanyScope(
        actor,
        data.companyId,
      );
      data.companyId = companyId;
    }

    const current = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true, roleId: true, username: true },
    });

    const roleUpdate = Object.prototype.hasOwnProperty.call(data, 'roleId')
      ? await this.resolveRoleAssignment(data.roleId, actor, 'EMPLOYEE')
      : {
          roleId: current?.roleId || null,
          roleName: current?.role || 'EMPLOYEE',
        };

    this.assertSuperAdminOwnershipRule(current?.username, roleUpdate.roleName);

    const updateData: {
      email?: string;
      username?: string;
      name?: string;
      role?: string;
      roleId?: string | null;
      status?: string;
      companyId?: string | null;
      password?: string;
    } = {
      email: data.email,
      username: data.username,
      name: data.name,
      role: roleUpdate.roleName,
      roleId: roleUpdate.roleId,
      status: data.status,
    };

    if (Object.prototype.hasOwnProperty.call(data, 'companyId')) {
      updateData.companyId = data.companyId || null;
    }

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        company: true,
        roleRelation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async updateStatus(id: string, status: string, actor?: Actor) {
    await this.assertUserInScope(id, actor);

    return this.prisma.user.update({
      where: { id },
      data: { status },
      include: {
        company: true,
        roleRelation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async assignRole(id: string, roleId: string, actor?: Actor) {
    await this.assertUserInScope(id, actor);

    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { username: true },
    });

    const roleAssignment = await this.resolveRoleAssignment(
      roleId,
      actor,
      'EMPLOYEE',
    );
    this.assertSuperAdminOwnershipRule(
      target?.username,
      roleAssignment.roleName,
    );

    return this.prisma.user.update({
      where: { id },
      data: {
        roleId: roleAssignment.roleId,
        role: roleAssignment.roleName,
      },
      include: {
        company: true,
        roleRelation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async resetPassword(id: string, newPassword: string, actor?: Actor) {
    await this.assertUserInScope(id, actor);

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    return this.prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });
  }

  async remove(id: string, actor?: Actor) {
    await this.assertUserInScope(id, actor);

    return this.prisma.user.delete({
      where: { id },
    });
  }
}
