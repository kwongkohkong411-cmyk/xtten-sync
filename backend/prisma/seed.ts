import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 RBAC SEED START");

  // =========================
  // 1. ROLES
  // =========================
  const roles = [
    { name: "SUPER_ADMIN", description: "Full access", isSystem: true },
    { name: "COMPANY_ADMIN", description: "Company admin", isSystem: true },
    { name: "HR", description: "HR management", isSystem: true },
    { name: "MANAGER", description: "Department manager", isSystem: true },
    { name: "TEAM_LEADER", description: "Team leader", isSystem: true },
    { name: "FINANCE", description: "Finance access", isSystem: true },
    { name: "EMPLOYEE", description: "Basic employee", isSystem: true },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: role,
      create: role,
    });
  }

  console.log("✅ Roles done");

  // =========================
  // 2. PERMISSIONS (module/action)
  // =========================
  const permissions = [
    { module: "company", action: "manage", label: "Company Manage" },
    { module: "department", action: "manage", label: "Department Manage" },
    { module: "employee", action: "manage", label: "Employee Manage" },
    { module: "attendance", action: "manage", label: "Attendance Manage" },
    { module: "report", action: "view", label: "Report View" },
    { module: "user", action: "manage", label: "User Manage" },
    { module: "system", action: "admin", label: "System Admin" },
  ];

  for (const p of permissions) {
    await prisma.permission.upsert({
      where: {
        module_action: {
          module: p.module,
          action: p.action,
        },
      },
      update: p,
      create: p,
    });
  }

  console.log("✅ Permissions done");

  // =========================
  // 3. SUPER ADMIN FULL ACCESS
  // (IMPORTANT: NO TSX / NO ESM ISSUE)
  // =========================
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

  console.log("🎉 RBAC SEED COMPLETED");
}

main()
  .catch((e) => {
    console.error("❌ SEED ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });