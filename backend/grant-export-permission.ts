import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.employee.findFirst({
    where: { email: 'validation@test.local' },
    include: { user: true },
  });

  if (!emp?.user) {
    console.log('User not found');
    return;
  }

  // Get or create report:export permission
  let perm = await prisma.permission.findUnique({
    where: { key: 'report:export' },
  });
  if (!perm) {
    console.log('Creating report:export permission...');
    perm = await prisma.permission.create({
      data: { key: 'report:export', desc: 'Export reports' },
    });
  }

  // Get admin role
  let role = await prisma.role.findFirst({
    where: { name: 'admin' },
  });
  if (!role) {
    console.log('Admin role not found, creating...');
    role = await prisma.role.create({
      data: { name: 'admin', description: 'Administrator', isSystem: true },
    });
  }

  // Assign report:export to the role
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
    update: {},
    create: { roleId: role.id, permissionId: perm.id },
  });

  console.log('Permission report:export granted to admin role');
  await prisma.$disconnect();
}

main().catch(console.error);
