import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const OWNER_USERNAME = 'sn888xt';
const OWNER_EMAIL = 'sn888xt@xtten.local';
const OWNER_PASSWORD = '123456';
const OWNER_NAME = 'sn888xt';
const DEFAULT_COMPANY_CODE = 'XTTEN_DEFAULT';

async function ensureDefaultCompany() {
  const firstCompany = await prisma.company.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (firstCompany) {
    return firstCompany;
  }

  return prisma.company.create({
    data: {
      name: 'XTTEN Default Company',
      code: DEFAULT_COMPANY_CODE,
      country: 'CN',
      timezone: 'Asia/Shanghai',
      plan: 'FREE',
      status: 'ACTIVE',
    },
  });
}

async function main() {
  console.log('RBAC SEED START');

  const roles = [
    'SUPER_ADMIN',
    'COMPANY_ADMIN',
    'HR',
    'MANAGER',
    'TEAM_LEAD',
    'EMPLOYEE',
    'AUDITOR',
  ] as const;

  const permissions = [
    'attendance:view',
    'attendance:manage',
    'shift:view',
    'shift:manage',
    'leave:view',
    'leave:manage',
    'leave:submit',
    'activity:view',
    'activity:manage',
    'report:view',
    'report:export',
    'user:manage',
  ] as const;

  const roleMap: Record<(typeof roles)[number], readonly string[]> = {
    SUPER_ADMIN: permissions,
    COMPANY_ADMIN: [
      'user:manage',
      'shift:manage',
      'attendance:manage',
      'activity:view',
      'leave:manage',
      'report:view',
      'report:export',
    ],
    HR: [
      'attendance:view',
      'leave:manage',
      'report:view',
      'report:export',
      'activity:view',
    ],
    MANAGER: ['attendance:view', 'activity:view', 'report:view', 'leave:view'],
    TEAM_LEAD: ['attendance:view', 'activity:view', 'report:view'],
    EMPLOYEE: [
      'attendance:view',
      'activity:view',
      'leave:view',
      'leave:submit',
    ],
    AUDITOR: ['report:view', 'attendance:view'],
  };

  for (const name of roles) {
    await prisma.role.upsert({
      where: { name },
      update: { description: name, isSystem: true },
      create: { name, description: name, isSystem: true },
    });
  }

  for (const key of permissions) {
    await prisma.permission.upsert({
      where: { key },
      update: { desc: key },
      create: { key, desc: key },
    });
  }

  const roleRows = await prisma.role.findMany({
    where: { name: { in: [...roles] } },
    select: { id: true, name: true },
  });

  const permissionRows = await prisma.permission.findMany({
    where: { key: { in: [...permissions] } },
    select: { id: true, key: true },
  });

  const permissionIdByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  for (const role of roleRows) {
    const wanted = roleMap[role.name as keyof typeof roleMap] || [];
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    for (const key of wanted) {
      const permissionId = permissionIdByKey.get(key);
      if (!permissionId) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId,
        },
      });
    }
  }

  const superAdminRole = roleRows.find((role) => role.name === 'SUPER_ADMIN');
  if (!superAdminRole) {
    throw new Error('SUPER_ADMIN role is missing after seed');
  }

  const ownerCompany = await ensureDefaultCompany();
  const ownerPasswordHash = await bcrypt.hash(OWNER_PASSWORD, 10);

  const ownerUser = await prisma.user.upsert({
    where: { username: OWNER_USERNAME },
    update: {
      email: OWNER_EMAIL,
      name: OWNER_NAME,
      password: ownerPasswordHash,
      role: 'SUPER_ADMIN',
      roleId: superAdminRole.id,
      status: 'ACTIVE',
      companyId: ownerCompany.id,
    },
    create: {
      email: OWNER_EMAIL,
      username: OWNER_USERNAME,
      name: OWNER_NAME,
      password: ownerPasswordHash,
      role: 'SUPER_ADMIN',
      roleId: superAdminRole.id,
      status: 'ACTIVE',
      companyId: ownerCompany.id,
    },
  });

  await prisma.employee.upsert({
    where: { userId: ownerUser.id },
    update: {
      name: OWNER_NAME,
      companyId: ownerCompany.id,
      status: 'ACTIVE',
      terminatedAt: null,
      terminationReason: null,
    },
    create: {
      name: OWNER_NAME,
      userId: ownerUser.id,
      companyId: ownerCompany.id,
      status: 'ACTIVE',
    },
  });

  console.log('RBAC SEED COMPLETED');
}

main()
  .catch((e) => {
    console.error('SEED ERROR', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
