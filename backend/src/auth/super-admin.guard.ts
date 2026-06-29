import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

type User = {
  id: string;
  email?: string;
  username?: string;
};

/**
 * 守卫：仅允许 sn888xt 账户访问 SuperAdmin 功能
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: User = request.user;

    if (!user) {
      throw new ForbiddenException('用户未认证');
    }

    // 检查用户是否是 sn888xt
    const isSuperAdmin =
      user.username === 'sn888xt' || user.email === 'sn888xt@xtten.com';

    if (!isSuperAdmin) {
      throw new ForbiddenException('此功能仅限 SuperAdmin 访问');
    }

    return true;
  }
}
