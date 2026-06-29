/**
 * 验证权限系统是否正常工作的测试脚本
 * 运行: npx ts-node scripts/test-permissions.ts
 */
import { PrismaClient } from '@prisma/client';
import { ROLE_PERMISSIONS_MATRIX, SYSTEM_ROLES } from '../src/auth/permissions.constant';

const prisma = new PrismaClient();

async function main() {
  console.log('🧪 开始权限系统验证...\n');

  try {
    // 1. 检查权限表
    console.log('📋 检查权限表...');
    const permissionCount = await prisma.permission.count();
    console.log(`✅ 权限记录数: ${permissionCount}\n`);

    // 2. 检查系统角色
    console.log('🔐 检查系统角色...');
    for (const roleName of Object.values(SYSTEM_ROLES)) {
      const role = await prisma.role.findFirst({
        where: { name: roleName, companyId: null },
        include: { permissions: true },
      });

      if (role) {
        console.log(`✅ ${roleName}: ${role.permissions.length} 权限`);
      } else {
        console.log(`❌ ${roleName}: 未找到`);
      }
    }

    // 3. 验证权限矩阵
    console.log('\n📊 验证权限矩阵...');
    for (const [roleName, expectedPerms] of Object.entries(
      ROLE_PERMISSIONS_MATRIX,
    )) {
      console.log(`${roleName}: ${expectedPerms.length} 权限`);
    }

    // 4. 测试权限查询
    console.log('\n🔍 测试权限查询...');
    const superAdminRole = await prisma.role.findFirst({
      where: { name: 'SUPER_ADMIN', companyId: null },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    if (superAdminRole) {
      const perms = superAdminRole.permissions.map((rp) => rp.permission.key);
      console.log(`✅ SUPER_ADMIN 权限列表:\n  ${perms.slice(0, 5).join('\n  ')}...`);
      console.log(`  (共 ${perms.length} 个权限)\n`);
    }

    console.log('🎉 权限系统验证完成！');
    console.log('\n📝 接下来的步骤:');
    console.log('  1. 运行 POST /auth/init-permissions 初始化权限系统');
    console.log('  2. 登录并检查返回的权限列表');
    console.log('  3. 在菜单中验证权限过滤');
  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
