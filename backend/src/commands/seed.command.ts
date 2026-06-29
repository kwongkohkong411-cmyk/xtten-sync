import { Injectable } from '@nestjs/common';
import { PermissionSeederService } from '../auth/permission-seeder.service';

/**
 * 权限初始化服务
 * 可以通过 REST API 或命令行调用
 */
@Injectable()
export class PermissionInitializeService {
  constructor(private readonly permissionSeeder: PermissionSeederService) {}

  async initialize() {
    console.log('🌱 开始初始化权限系统...');
    const result = await this.permissionSeeder.seedPermissionsAndRoles();
    if (result.success) {
      console.log('✅ 权限系统初始化成功！');
      return { success: true, message: '权限系统初始化成功' };
    } else {
      console.error('❌ 权限系统初始化失败');
      throw new Error('权限系统初始化失败');
    }
  }
}
