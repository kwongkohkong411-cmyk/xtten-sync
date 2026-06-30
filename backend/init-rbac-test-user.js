/**
 * Initialize RBAC for test user with attendance:manage permission
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function initializeRBAC() {
  try {
    console.log('Initializing RBAC for test user...\n');

    // Get or create company
    let company = await prisma.company.findFirst({ where: { name: 'test' } });
    if (!company) {
      console.log('❌ Test company not found');
      return;
    }
    console.log(`✅ Company: ${company.name}`);

    // Ensure COMPANY_ADMIN role exists
    let role = await prisma.role.findFirst({
      where: { name: 'COMPANY_ADMIN', companyId: company.id }
    });

    if (!role) {
      role = await prisma.role.create({
        data: {
          name: 'COMPANY_ADMIN',
          description: 'Company Administrator',
          companyId: company.id,
        }
      });
      console.log(`✅ Created COMPANY_ADMIN role`);
    } else {
      console.log(`✅ Found COMPANY_ADMIN role`);
    }

    // Ensure permissions exist
    const permissionKeys = [
      'attendance:view',
      'attendance:manage',
      'shift:view',
      'shift:manage',
      'leave:view',
      'leave:manage',
      'user:manage',
      'employees:view',
      'employees:manage',
      'rosters:view',
      'rosters:manage',
    ];

    const permissions = {};
    for (const key of permissionKeys) {
      let perm = await prisma.permission.findFirst({ where: { key } });
      if (!perm) {
        perm = await prisma.permission.create({
          data: {
            key,
            desc: `Permission for ${key}`,
          }
        });
      }
      permissions[key] = perm;
    }
    console.log(`✅ Ensured ${permissionKeys.length} permissions exist`);

    // Assign permissions to COMPANY_ADMIN role
    for (const key of permissionKeys) {
      const existing = await prisma.rolePermission.findFirst({
        where: {
          roleId: role.id,
          permissionId: permissions[key].id,
        }
      });

      if (!existing) {
        await prisma.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId: permissions[key].id,
          }
        });
      }
    }
    console.log(`✅ Assigned ${permissionKeys.length} permissions to COMPANY_ADMIN role`);

    // Create or update test user
    const email = 'validation@test.local';
    const pwd = await bcrypt.hash('validation123', 10);

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          username: 'validation',
          password: pwd,
          name: 'Validation Test User',
          role: 'COMPANY_ADMIN',
          status: 'ACTIVE',
          companyId: company.id,
          roleId: role.id,
        }
      });
      console.log(`✅ Created user: ${email}`);
    } else {
      // Update roleId if not set
      if (!user.roleId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { roleId: role.id }
        });
        console.log(`✅ Updated user role: ${email}`);
      }
    }

    // Create employee if not exists
    let emp = await prisma.employee.findUnique({ where: { userId: user.id } });
    if (!emp) {
      const team = await prisma.workGroup.findFirst({
        where: { name: 'A morning', companyId: company.id }
      });

      emp = await prisma.employee.create({
        data: {
          name: user.name,
          email: user.email,
          companyId: company.id,
          userId: user.id,
          workGroupId: team?.id || null,
          status: 'ACTIVE',
        }
      });
      console.log(`✅ Created employee`);
    }

    console.log('\n✅ RBAC INITIALIZATION COMPLETE');
    console.log(`\nLogin credentials:`);
    console.log(`  Email: ${email}`);
    console.log(`  Password: validation123`);
    console.log(`  Role: COMPANY_ADMIN`);
    console.log(`  Permissions: attendance:manage, attendance:view, + more\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

initializeRBAC();
