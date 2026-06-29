import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import bcrypt from 'bcrypt';
import { BaseRbacService } from '../auth/base-rbac.service';
import { Actor, RbacCoreService } from '../auth/rbac-core.service';

type UserCreateInput = {
  email?: string;
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

type RoleAssignment = {
  roleId: string | null;
  roleName: string;
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

  private uniqueUsersById<T extends { id: string }>(users: T[]) {
    const seen = new Set<string>();
    return users.filter((user) => {
      if (seen.has(user.id)) {
        return false;
      }
      seen.add(user.id);
      return true;
    });
  }

  private normalizeUsername(username: string | null | undefined) {
    return (username || '').trim().toLowerCase();
  }

  private buildFallbackEmail(username: string) {
    const normalized = this.normalizeUsername(username);
    if (!normalized) {
      return `employee.${Date.now()}@xtten.local`;
    }
    if (normalized.includes('@')) {
      return normalized;
    }
    return `${normalized}@xtten.local`;
  }

  private isOwnerUsername(username: string | null | undefined) {
    return this.normalizeUsername(username) === this.superAdminOwnerUsername;
  }

  private assertOwnerAccountWritePolicy(params: {
    currentUsername?: string | null;
    currentCompanyId?: string | null;
    nextRoleName: string;
    patch: UserUpdateInput;
  }) {
    if (!this.isOwnerUsername(params.currentUsername)) {
      return;
    }

    if (
      typeof params.patch.username === 'string' &&
      this.normalizeUsername(params.patch.username) !==
        this.superAdminOwnerUsername
    ) {
      throw new ForbiddenException(
        'Designated SUPER_ADMIN owner username cannot be changed',
      );
    }

    if (typeof params.patch.password === 'string') {
      throw new ForbiddenException(
        'Designated SUPER_ADMIN owner password is managed by system policy',
      );
    }

    if (
      typeof params.patch.status === 'string' &&
      params.patch.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException(
        'Designated SUPER_ADMIN owner account cannot be deactivated',
      );
    }

    if (params.nextRoleName !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Designated SUPER_ADMIN owner account cannot be downgraded',
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(params.patch, 'companyId') &&
      params.patch.companyId !== undefined &&
      params.patch.companyId !== params.currentCompanyId
    ) {
      throw new ForbiddenException(
        'Designated SUPER_ADMIN owner company scope cannot be changed',
      );
    }
  }

  private async getUserIdentity(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        username: true,
        companyId: true,
        role: true,
        roleId: true,
      },
    });
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

    const users = await this.prisma.user.findMany({
      where,
      distinct: ['id'],
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

    return this.uniqueUsersById(users);
  }

  async findByCompany(companyId: string, actor?: Actor) {
    const { companyId: scopedCompanyId } =
      await this.rbacCore.assertCompanyScope(actor, companyId);

    const users = await this.prisma.user.findMany({
      where: { companyId: scopedCompanyId },
      distinct: ['id'],
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

    return this.uniqueUsersById(users);
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

  private assertReservedOwnerUsernameMutation(params: {
    nextUsername?: string | null;
    currentUsername?: string | null;
  }) {
    const next = this.normalizeUsername(params.nextUsername);
    if (!next || next !== this.superAdminOwnerUsername) {
      return;
    }

    const current = this.normalizeUsername(params.currentUsername);
    if (current === this.superAdminOwnerUsername) {
      return;
    }

    throw new ForbiddenException(
      `Username ${this.superAdminOwnerUsername} is reserved for designated SUPER_ADMIN owner`,
    );
  }

  private assertOwnerRoleUnchanged(params: {
    currentUsername?: string | null;
    currentRoleId?: string | null;
    nextRoleId?: string | null;
  }) {
    if (!this.isOwnerUsername(params.currentUsername)) {
      return;
    }

    if (
      params.nextRoleId !== undefined &&
      (params.currentRoleId || null) !== (params.nextRoleId || null)
    ) {
      throw new ForbiddenException(
        'Designated SUPER_ADMIN owner role/permission assignment cannot be changed',
      );
    }
  }

  private async assertUsernameAvailable(
    username: string,
    excludeUserId?: string,
  ) {
    const normalized = this.normalizeUsername(username);
    if (!normalized) {
      throw new BadRequestException('Username is required');
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        username: {
          equals: normalized,
          mode: 'insensitive',
        },
        ...(excludeUserId
          ? {
              id: {
                not: excludeUserId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new BadRequestException('Username already exists');
    }
  }

  async create(data: UserCreateInput, actor?: Actor) {
    const normalizedUsername = this.normalizeUsername(data.username);
    await this.assertUsernameAvailable(normalizedUsername);

    this.assertReservedOwnerUsernameMutation({
      nextUsername: normalizedUsername,
    });

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
    this.assertSuperAdminOwnershipRule(
      normalizedUsername,
      roleAssignment.roleName,
    );
    const resolvedEmail =
      data.email?.trim() || this.buildFallbackEmail(normalizedUsername);

    return this.prisma.user.create({
      data: {
        email: resolvedEmail,
        username: normalizedUsername,
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

    const current = await this.getUserIdentity(id);

    const normalizedUsername =
      typeof data.username === 'string'
        ? this.normalizeUsername(data.username)
        : undefined;

    if (normalizedUsername) {
      await this.assertUsernameAvailable(normalizedUsername, id);
    }

    const roleUpdate: RoleAssignment = Object.prototype.hasOwnProperty.call(
      data,
      'roleId',
    )
      ? await this.resolveRoleAssignment(data.roleId, actor, 'EMPLOYEE')
      : {
          roleId: current?.roleId || null,
          roleName: current?.role || 'EMPLOYEE',
        };

    this.assertReservedOwnerUsernameMutation({
      nextUsername: normalizedUsername,
      currentUsername: current?.username,
    });
    this.assertOwnerRoleUnchanged({
      currentUsername: current?.username,
      currentRoleId: current?.roleId,
      nextRoleId: roleUpdate.roleId,
    });

    this.assertSuperAdminOwnershipRule(current?.username, roleUpdate.roleName);
    this.assertOwnerAccountWritePolicy({
      currentUsername: current?.username,
      currentCompanyId: current?.companyId,
      nextRoleName: roleUpdate.roleName,
      patch: data,
    });

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
      username: normalizedUsername,
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

    const target = await this.getUserIdentity(id);
    if (this.isOwnerUsername(target?.username) && status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Designated SUPER_ADMIN owner account cannot be deactivated',
      );
    }

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
      select: { username: true, roleId: true },
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
    this.assertOwnerRoleUnchanged({
      currentUsername: target?.username,
      currentRoleId: target?.roleId,
      nextRoleId: roleAssignment.roleId,
    });

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

    const target = await this.getUserIdentity(id);
    if (this.isOwnerUsername(target?.username)) {
      throw new ForbiddenException(
        'Designated SUPER_ADMIN owner password is managed by system policy',
      );
    }

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

    const target = await this.getUserIdentity(id);
    if (this.isOwnerUsername(target?.username)) {
      throw new ForbiddenException(
        'Designated SUPER_ADMIN owner account cannot be deleted',
      );
    }

    return this.prisma.user.delete({
      where: { id },
    });
  }
}
