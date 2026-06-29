import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Creating test data...\n');

  try {
    // 1. Create a company first
    let company = await prisma.company.findFirst();
    
    if (!company) {
      company = await prisma.company.create({
        data: {
          code: 'TEST_CO',
          name: 'Test Company',
          timezone: 'Asia/Shanghai',
          country: 'China',
        },
      });
      console.log(`✅ Created company: ${company.name}`);
    } else {
      console.log(`✅ Using existing company: ${company.name}`);
    }

    // 2. Create system roles with company_id = null
    const roles: Record<string, { id: string }> = {};
    
    for (const roleName of ['SUPER_ADMIN', 'COMPANY_ADMIN', 'TEAM_LEAD', 'EMPLOYEE']) {
      let role = await prisma.role.findFirst({
        where: { name: roleName, companyId: null },
      });

      if (!role) {
        role = await prisma.role.create({
          data: {
            name: roleName,
            description: `System ${roleName}`,
            isSystem: true,
            companyId: null,
          },
        });
        console.log(`✅ Created role: ${roleName}`);
      } else {
        console.log(`✅ Role already exists: ${roleName}`);
      }
      
      roles[roleName] = role;
    }

    // 3. Create test users
    const testUsers = [
      {
        username: 'sn888xt',
        email: 'sn888xt@xtten.com',
        password: 'password123',
        role: roles['SUPER_ADMIN'],
        companyId: null,
      },
      {
        username: 'admin1',
        email: 'admin1@xtten.com',
        password: 'password123',
        role: roles['COMPANY_ADMIN'],
        companyId: company.id,
      },
      {
        username: 'lead1',
        email: 'lead1@xtten.com',
        password: 'password123',
        role: roles['TEAM_LEAD'],
        companyId: company.id,
      },
      {
        username: 'emp1',
        email: 'emp1@xtten.com',
        password: 'password123',
        role: roles['EMPLOYEE'],
        companyId: company.id,
      },
    ];

    for (const testUser of testUsers) {
      const existing = await prisma.user.findFirst({
        where: { username: testUser.username },
      });

      if (!existing) {
        const hash = await bcrypt.hash(testUser.password, 10);
        const user = await prisma.user.create({
          data: {
            username: testUser.username,
            email: testUser.email,
            password: hash,
            name: testUser.username,
            roleId: testUser.role.id,
            companyId: testUser.companyId,
          },
        });
        console.log(`✅ Created user: ${testUser.username}`);
      } else {
        console.log(`✅ User already exists: ${testUser.username}`);
      }
    }

    console.log('\n✅ Test data seeding complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
