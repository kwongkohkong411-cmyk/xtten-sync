/**
 * Initialize Permission Tree
 * 将新的权限树结构和预设角色权限初始化到数据库
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 权限树结构 (与前端保持同步)
const PERMISSION_TREE = [
  {
    key: 'dashboard:overview:view',
  },
  {
    key: 'organization:company-manage:create',
  },
  {
    key: 'organization:company-manage:edit',
  },
  {
    key: 'organization:company-manage:delete',
  },
  {
    key: 'organization:company-manage:view',
  },
  {
    key: 'organization:company-users:create',
  },
  {
    key: 'organization:company-users:edit',
  },
  {
    key: 'organization:company-users:delete',
  },
  {
    key: 'organization:company-users:view',
  },
  {
    key: 'organization:company-roles:create',
  },
  {
    key: 'organization:company-roles:edit',
  },
  {
    key: 'organization:company-roles:delete',
  },
  {
    key: 'organization:company-roles:view',
  },
  {
    key: 'organization:roles-assignment:create',
  },
  {
    key: 'organization:roles-assignment:edit',
  },
  {
    key: 'organization:roles-assignment:delete',
  },
  {
    key: 'organization:roles-assignment:view',
  },
  {
    key: 'teams:team:create',
  },
  {
    key: 'teams:team:edit',
  },
  {
    key: 'teams:team:delete',
  },
  {
    key: 'teams:team:view',
  },
  {
    key: 'attendance:records:view',
  },
  {
    key: 'attendance:calendar:view',
  },
  {
    key: 'attendance:summary:view',
  },
  {
    key: 'shift:templates:create',
  },
  {
    key: 'shift:templates:view',
  },
  {
    key: 'shift:templates:edit',
  },
  {
    key: 'shift:templates:delete',
  },
  {
    key: 'shift:rosters:create',
  },
  {
    key: 'shift:rosters:view',
  },
  {
    key: 'shift:rosters:edit',
  },
  {
    key: 'shift:rosters:delete',
  },
  {
    key: 'leave:apply:create',
  },
  {
    key: 'leave:apply:view',
  },
  {
    key: 'leave:apply:delete',
  },
  {
    key: 'leave:requests:view',
  },
  {
    key: 'leave:requests:edit',
  },
  {
    key: 'leave:requests:delete',
  },
  {
    key: 'leave:requests:approve',
  },
  {
    key: 'leave:requests:reject',
  },
  {
    key: 'leave:settings:create',
  },
  {
    key: 'leave:settings:view',
  },
  {
    key: 'leave:settings:edit',
  },
  {
    key: 'leave:settings:delete',
  },
  {
    key: 'reports:daily:view',
  },
  {
    key: 'reports:daily:export',
  },
  {
    key: 'reports:monthly:view',
  },
  {
    key: 'reports:monthly:export',
  },
  {
    key: 'reports:summary:view',
  },
  {
    key: 'reports:summary:export',
  },
  {
    key: 'users-roles:users:create',
  },
  {
    key: 'users-roles:users:view',
  },
  {
    key: 'users-roles:users:edit',
  },
  {
    key: 'users-roles:users:delete',
  },
  {
    key: 'users-roles:roles:edit',
  },
  {
    key: 'users-roles:roles:delete',
  },
  {
    key: 'users-roles:permissions:create',
  },
  {
    key: 'users-roles:permissions:edit',
  },
  {
    key: 'billing:plan:view',
  },
  {
    key: 'billing:invoice:view',
  },
  {
    key: 'screenshot:wall:view',
  },
  {
    key: 'screenshot:wall:export',
  },
  {
    key: 'profile:profile:view',
  },
];

// 预设角色权限
const ROLE_PERMISSIONS_PRESETS: Record<string, string[]> = {
  SUPER_ADMIN: PERMISSION_TREE.map((p) => p.key),

  COMPANY_ADMIN: [
    'dashboard:overview:view',
    'organization:company-manage:create',
    'organization:company-manage:edit',
    'organization:company-manage:delete',
    'organization:company-manage:view',
    'organization:company-users:create',
    'organization:company-users:edit',
    'organization:company-users:delete',
    'organization:company-users:view',
    'organization:company-roles:view',
    'organization:company-roles:edit',
    'organization:company-roles:delete',
    'organization:roles-assignment:create',
    'organization:roles-assignment:edit',
    'organization:roles-assignment:delete',
    'organization:roles-assignment:view',
    'teams:team:create',
    'teams:team:edit',
    'teams:team:delete',
    'teams:team:view',
    'attendance:records:view',
    'attendance:calendar:view',
    'attendance:summary:view',
    'shift:templates:create',
    'shift:templates:view',
    'shift:templates:edit',
    'shift:templates:delete',
    'shift:rosters:create',
    'shift:rosters:view',
    'shift:rosters:edit',
    'shift:rosters:delete',
    'leave:apply:create',
    'leave:apply:view',
    'leave:apply:delete',
    'leave:requests:view',
    'leave:requests:edit',
    'leave:requests:delete',
    'leave:requests:approve',
    'leave:requests:reject',
    'leave:settings:create',
    'leave:settings:view',
    'leave:settings:edit',
    'leave:settings:delete',
    'reports:daily:view',
    'reports:daily:export',
    'reports:monthly:view',
    'reports:monthly:export',
    'reports:summary:view',
    'reports:summary:export',
    'users-roles:users:create',
    'users-roles:users:view',
    'users-roles:users:edit',
    'users-roles:users:delete',
    'users-roles:roles:edit',
    'users-roles:roles:delete',
    'users-roles:permissions:create',
    'users-roles:permissions:edit',
    'billing:plan:view',
    'billing:invoice:view',
    'profile:profile:view',
    'screenshot:wall:view',
    'screenshot:wall:export',
  ],

  TEAM_LEAD: [
    'dashboard:overview:view',
    'teams:team:create',
    'teams:team:edit',
    'teams:team:delete',
    'teams:team:view',
    'attendance:records:view',
    'attendance:calendar:view',
    'attendance:summary:view',
    'shift:templates:create',
    'shift:templates:view',
    'shift:templates:edit',
    'shift:templates:delete',
    'shift:rosters:create',
    'shift:rosters:view',
    'shift:rosters:edit',
    'shift:rosters:delete',
    'leave:apply:create',
    'leave:apply:view',
    'leave:requests:view',
    'leave:requests:edit',
    'leave:requests:approve',
    'leave:requests:reject',
    'reports:daily:view',
    'reports:daily:export',
    'reports:monthly:view',
    'reports:monthly:export',
    'reports:summary:view',
    'reports:summary:export',
    'users-roles:users:create',
    'users-roles:users:view',
    'users-roles:users:edit',
    'users-roles:users:delete',
    'profile:profile:view',
    'screenshot:wall:view',
    'screenshot:wall:export',
  ],

  EMPLOYEE: [
    'dashboard:overview:view',
    'teams:team:view',
    'attendance:records:view',
    'attendance:calendar:view',
    'attendance:summary:view',
    'leave:apply:create',
    'leave:apply:view',
    'leave:apply:delete',
    'leave:requests:view',
    'profile:profile:view',
  ],
};

async function main() {
  console.log('🔧 Initializing permission tree structure...\n');

  try {
    // 1. Create/update all permissions
    console.log('1️⃣ Creating permission nodes...');
    for (const permission of PERMISSION_TREE) {
      await prisma.permission.upsert({
        where: { key: permission.key },
        update: { desc: permission.key },
        create: { key: permission.key, desc: permission.key },
      });
    }
    console.log(`   ✓ ${PERMISSION_TREE.length} permissions created/updated\n`);

    // 2. Get all system roles
    console.log('2️⃣ Getting system roles...');
    const systemRoles = await prisma.role.findMany({
      where: { isSystem: true, name: { in: Object.keys(ROLE_PERMISSIONS_PRESETS) } },
      select: { id: true, name: true },
    });
    console.log(`   ✓ Found ${systemRoles.length} system roles\n`);

    // 3. Get all permissions by key
    console.log('3️⃣ Fetching all permissions...');
    const allPermissions = await prisma.permission.findMany({
      select: { id: true, key: true },
    });
    const permissionIdByKey = new Map(allPermissions.map((p) => [p.key, p.id]));
    console.log(`   ✓ ${allPermissions.length} permissions loaded\n`);

    // 4. Update role permissions
    console.log('4️⃣ Updating role permissions...');
    for (const role of systemRoles) {
      const wantedPermissionKeys =
        ROLE_PERMISSIONS_PRESETS[role.name as keyof typeof ROLE_PERMISSIONS_PRESETS] || [];

      // Delete existing role permissions
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

      // Create new role permissions
      let createdCount = 0;
      for (const key of wantedPermissionKeys) {
        const permissionId = permissionIdByKey.get(key);
        if (permissionId) {
          await prisma.rolePermission.create({
            data: {
              roleId: role.id,
              permissionId,
            },
          });
          createdCount++;
        }
      }

      console.log(`   ✓ ${role.name}: ${createdCount} permissions assigned`);
    }

    console.log('\n✅ Permission tree initialization completed!\n');
    console.log('📊 Summary:');
    console.log(`   - Total permissions: ${PERMISSION_TREE.length}`);
    console.log(`   - System roles updated: ${systemRoles.length}`);

  } catch (error) {
    console.error('❌ Error during initialization:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Initialization failed:', error);
    process.exit(1);
  });
