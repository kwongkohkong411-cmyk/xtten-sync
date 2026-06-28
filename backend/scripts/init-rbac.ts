import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("INIT RBAC START");

  const roles = [
    "SUPER_ADMIN",
    "COMPANY_ADMIN",
    "HR",
    "MANAGER",
    "TEAM_LEAD",
    "EMPLOYEE",
    "AUDITOR",
  ] as const;

  const permissions = [
    "attendance:view",
    "attendance:manage",
    "shift:view",
    "shift:manage",
    "leave:view",
    "leave:manage",
    "leave:submit",
    "holiday:view",
    "holiday:manage",
    "activity:view",
    "activity:manage",
    "report:view",
    "report:export",
    "user:manage",
  ] as const;

  const roleMap: Record<(typeof roles)[number], readonly string[]> = {
    SUPER_ADMIN: permissions,
    COMPANY_ADMIN: ["user:manage", "shift:manage", "attendance:manage", "activity:manage", "leave:manage", "holiday:manage", "report:view", "report:export"],
    HR: ["attendance:view", "leave:manage", "holiday:view", "report:view", "report:export", "activity:view"],
    MANAGER: ["attendance:view", "activity:view", "report:view", "leave:view"],
    TEAM_LEAD: ["attendance:view", "activity:view", "report:view"],
    EMPLOYEE: ["attendance:view", "activity:view", "leave:view", "leave:submit"],
    AUDITOR: ["report:view", "attendance:view"],
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

  console.log("RBAC INIT DONE");
}

main()
  .catch((e) => {
    console.error("RBAC INIT ERROR", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
