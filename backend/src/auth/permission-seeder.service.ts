import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PERMISSIONS,
  SYSTEM_ROLES,
  ROLE_PERMISSIONS_MATRIX,
} from './permissions.constant';

@Injectable()
export class PermissionSeederService {
  private readonly logger = new Logger(PermissionSeederService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 初始化所有权限和系统角色
   */
  async seedPermissionsAndRoles() {
    try {
      // 1. 创建或更新所有权限
      const permissionKeys = Object.values(PERMISSIONS);
      const createdPermissions: Record<string, { id: string }> = {};

      for (const key of permissionKeys) {
        const permission = await this.prisma.permission.upsert({
          where: { key },
          update: { desc: this.getPermissionDescription(key) },
          create: {
            key,
            desc: this.getPermissionDescription(key),
          },
        });
        createdPermissions[key] = permission;
      }

      this.logger.log(`✅ 已创建/更新 ${permissionKeys.length} 个权限`);

      // 2. 创建或更新系统角色及其权限映射
      for (const [roleName, permissions] of Object.entries(
        ROLE_PERMISSIONS_MATRIX,
      )) {
        // 先查找系统角色（companyId = null）
        let role = await this.prisma.role.findFirst({
          where: { name: roleName, companyId: null },
        });

        // 如果不存在则创建
        if (!role) {
          role = await this.prisma.role.create({
            data: {
              name: roleName,
              description: this.getRoleDescription(roleName),
              isSystem: true,
              isCustom: false,
              companyId: null,
            },
          });
        } else {
          // 如果存在则更新
          role = await this.prisma.role.update({
            where: { id: role.id },
            data: {
              isSystem: true,
              description: this.getRoleDescription(roleName),
            },
          });
        }

        // 删除旧的权限映射
        await this.prisma.rolePermission.deleteMany({
          where: { roleId: role.id },
        });

        // 创建新的权限映射
        const rolePermissions = permissions.map((perm) => ({
          roleId: role.id,
          permissionId: createdPermissions[perm].id,
        }));

        await this.prisma.rolePermission.createMany({
          data: rolePermissions,
        });

        this.logger.log(
          `✅ 已初始化角色 ${roleName}，包含 ${permissions.length} 个权限`,
        );
      }

      this.logger.log('🎉 权限系统初始化完成！');
      return { success: true };
    } catch (error) {
      this.logger.error('❌ 权限系统初始化失败:', error);
      throw error;
    }
  }

  private getPermissionDescription(key: string): string {
    const descriptions: Record<string, string> = {
      'dashboard:view': '查看仪表板',
      'organization:view': '查看组织',
      'organization:create': '创建组织',
      'organization:edit': '编辑组织',
      'organization:delete': '删除组织',
      'company:view': '查看公司信息',
      'company:edit': '编辑公司信息',
      'company:view_logo': '查看公司 Logo',
      'company:edit_logo': '编辑公司 Logo',
      'company:view_timezone': '查看时区设置',
      'teams:view': '查看团队',
      'teams:create': '创建团队',
      'teams:edit': '编辑团队',
      'teams:delete': '删除团队',
      'screenshot:view': '查看截图',
      'screenshot:export': '导出截图',
      'attendance:view': '查看考勤',
      'attendance:edit': '编辑考勤',
      'attendance:view_calendar': '查看考勤日历',
      'shift:view': '查看班次',
      'shift:create': '创建班次',
      'shift:edit': '编辑班次',
      'shift:delete': '删除班次',
      'leave:apply': '申请请假',
      'leave:view': '查看请假',
      'leave:approve': '批准请假',
      'leave:view_settings': '查看请假设置',
      'leave:edit_settings': '编辑请假设置',
      'report:view': '查看报表',
      'report:export': '导出报表',
      'report:view_advanced': '查看高级报表',
      'users:create': '创建用户',
      'users:view': '查看用户',
      'users:edit': '编辑用户',
      'users:delete': '删除用户',
      'roles:manage': '管理角色',
      'roles:view': '查看角色',
      'permissions:manage': '管理权限',
      'profile:view': '查看个人资料',
      'profile:edit': '编辑个人资料',
      'billing:view': '查看账单',
      'billing:edit': '编辑账单设置',
    };
    return descriptions[key] || key;
  }

  private getRoleDescription(role: string): string {
    const descriptions: Record<string, string> = {
      SUPER_ADMIN: '超级管理员 - 拥有所有权限',
      COMPANY_ADMIN: '公司管理员 - 管理公司及其资源',
      TEAM_LEAD: '团队负责人 - 管理团队成员和任务',
      EMPLOYEE: '员工 - 基本访问权限',
    };
    return descriptions[role] || role;
  }
}
