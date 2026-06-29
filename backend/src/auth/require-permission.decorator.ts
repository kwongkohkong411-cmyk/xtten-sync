import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permissions.constant';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

/**
 * 装饰器：标记 API 端点所需的权限
 * @example
 * @RequirePermission('users:create', 'users:edit')
 * @Post('/users')
 * async createUser() { }
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permissions);
