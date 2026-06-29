import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator';
import type { Permission } from './permissions.constant';
import { ROLE_PERMISSIONS_MATRIX, SYSTEM_ROLES } from './permissions.constant';

type User = {
  id: string;
  role: string;
  companyId?: string;
  email?: string;
};

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 获取装饰器中指定的权限
    const requiredPermissions = this.reflector.get<Permission[]>(
      REQUIRE_PERMISSION_KEY,
      context.getHandler(),
    );

    // 如果没有指定权限要求，允许通过
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: User = request.user;

    if (!user) {
      throw new ForbiddenException('用户未认证');
    }

    // 获取用户的所有权限
    const userPermissions = await this.getUserPermissions(user);

    // 检查用户是否拥有所有必需的权限
    const hasAllPermissions = requiredPermissions.every((perm) =>
      userPermissions.includes(perm),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `缺少权限: ${requiredPermissions.filter((p) => !userPermissions.includes(p)).join(', ')}`,
      );
    }

    return true;
  }

  /**
   * 获取用户的所有权限
   */
  private async getUserPermissions(user: User): Promise<Permission[]> {
    // 如果是系统角色，直接从矩阵获取
    if (Object.values(SYSTEM_ROLES).includes(user.role as any)) {
      return ROLE_PERMISSIONS_MATRIX[user.role as keyof typeof ROLE_PERMISSIONS_MATRIX] || [];
    }

    // 如果是自定义角色，从数据库获取
    const role = await this.prisma.role.findUnique({
      where: { id: user.role },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) {
      return [];
    }

    return role.permissions.map((rp) => rp.permission.key as Permission);
  }
}
