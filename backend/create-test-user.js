const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function createTestUser() {
  try {
    console.log('Creating test user...\n');
    
    // Hash a known password
    const password = 'test123456';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Get test company
    const company = await prisma.company.findFirst({ where: { name: 'test' } });
    if (!company) {
      console.log('❌ Test company not found');
      return;
    }
    
    // Check if test user already exists
    const existing = await prisma.user.findUnique({ where: { email: 'steptest@test.local' } });
    if (existing) {
      console.log(`Test user already exists: ${existing.email}`);
      console.log(`Password: test123456\n`);
      return;
    }
    
    // Create new test user
    const user = await prisma.user.create({
      data: {
        email: 'steptest@test.local',
        username: 'steptest',
        password: hashedPassword,
        name: 'Step4 Test User',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        companyId: company.id,
      },
    });
    
    console.log('✅ Test user created successfully!');
    console.log(`Email: ${user.email}`);
    console.log(`Username: ${user.username}`);
    console.log(`Password: test123456`);
    console.log(`Company: ${company.name}\n`);
    
    // Get or create employee
    let employee = await prisma.employee.findUnique({ where: { userId: user.id } });
    if (!employee) {
      // Find the "A morning" team
      const team = await prisma.workGroup.findFirst({
        where: { name: 'A morning', companyId: company.id }
      });
      
      if (team) {
        employee = await prisma.employee.create({
          data: {
            name: user.name,
            email: user.email,
            companyId: company.id,
            userId: user.id,
            workGroupId: team.id,
            status: 'ACTIVE',
          },
        });
        console.log(`✅ Employee created with Team: A morning\n`);
      } else {
        console.log(`⚠️  Team "A morning" not found\n`);
      }
    }
    
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
