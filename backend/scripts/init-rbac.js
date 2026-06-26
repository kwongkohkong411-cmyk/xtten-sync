const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 INIT RBAC START");

  const roles = [
    "SUPER_ADMIN",
    "COMPANY_ADMIN",
    "HR",
    "MANAGER",
    "TEAM_LEADER",
    "FINANCE",
    "EMPLOYEE",
  ];

  for (const name of roles) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: {
        name,
        description: name,
        isSystem: true,
      },
    });
  }

  console.log("✅ ROLES DONE");

  const permissions = [
    { module: "company", action: "manage" },
    { module: "department", action: "manage" },
    { module: "employee", action: "manage" },
    { module: "attendance", action: "manage" },
    { module: "report", action: "view" },
    { module: "user", action: "manage" },
    { module: "system", action: "admin" },
  ];

  for (const p of permissions) {
    await prisma.permission.upsert({
      where: {
        module_action: {
          module: p.module,
          action: p.action,
        },
      },
      update: {},
      create: p,
    });
  }

  console.log("✅ PERMISSIONS DONE");

  const superAdmin = await prisma.role.findUnique({
    where: { name: "SUPER_ADMIN" },
  });

  const allPermissions = await prisma.permission.findMany();

  if (superAdmin) {
    for (const perm of allPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: superAdmin.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: superAdmin.id,
          permissionId: perm.id,
        },
      });
    }
  }

  console.log("🎉 RBAC INIT DONE");
}

main()
  .catch((e) => {
    console.error("❌ ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });