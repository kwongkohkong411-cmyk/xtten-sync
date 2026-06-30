import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.employee.findFirst({
    where: { email: 'validation@test.local' },
    include: { user: { include: { roleRelation: { include: { permissions: { include: { permission: true } } } } } } },
  });

  if (!emp?.user) {
    console.log('User not found');
    return;
  }

  console.log('Employee:', emp.id.substring(0, 8));
  console.log('User:', emp.user.id.substring(0, 8));
  console.log('Current role:', emp.user.roleRelation?.name);
  console.log(
    'Permissions:',
    emp.user.roleRelation?.permissions.map((p) => p.permission.key) || [],
  );

  // Get or create report:view permission
  let perm = await prisma.permission.findUnique({
    where: { key: 'report:view' },
  });
  if (!perm) {
    console.log('Creating report:view permission...');
    perm = await prisma.permission.create({
      data: { key: 'report:view', desc: 'View reports' },
    });
  }

  // Get or create admin role (company-specific or system)
  let role = await prisma.role.findFirst({
    where: { name: 'admin' },
  });
  if (!role) {
    console.log('Creating admin role...');
    role = await prisma.role.create({
      data: { name: 'admin', description: 'Administrator', isSystem: true },
    });
  }

  // Assign report:view to the role
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
    update: {},
    create: { roleId: role.id, permissionId: perm.id },
  });

  console.log('Permission report:view granted to admin role');

  // Assign admin role to user
  emp.user.roleId = role.id;
  await prisma.user.update({
    where: { id: emp.user.id },
    data: { roleId: role.id },
  });

  console.log('Admin role assigned to user');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
