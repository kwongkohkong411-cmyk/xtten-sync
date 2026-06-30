const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function setupPermissions() {
  try {
    console.log('Setting up permissions for test user...\n');
    
    // Get or create test user
    let user = await prisma.user.findUnique({ 
      where: { email: 'steptest@test.local' }
    });
    
    if (!user) {
      console.log('Creating test user...');
      const password = 'test123456';
      const hashedPassword = await bcrypt.hash(password, 10);
      const company = await prisma.company.findFirst({ where: { name: 'test' } });
      
      user = await prisma.user.create({
        data: {
          email: 'steptest@test.local',
          username: 'steptest',
          password: hashedPassword,
          name: 'Step4 Test User',
          role: 'COMPANY_ADMIN',
          status: 'ACTIVE',
          companyId: company.id,
        },
      });
    }
    
    console.log(`✅ User: ${user.email} (${user.role})\n`);
    
    // Create employee if not exists
    let employee = await prisma.employee.findUnique({ where: { userId: user.id } });
    if (!employee) {
      const company = await prisma.company.findFirst({ where: { name: 'test' } });
      const team = await prisma.workGroup.findFirst({
        where: { name: 'A morning', companyId: company.id }
      });
      
      employee = await prisma.employee.create({
        data: {
          name: user.name,
          email: user.email,
          companyId: company.id,
          userId: user.id,
          workGroupId: team?.id,
          status: 'ACTIVE',
        },
      });
      
      console.log(`✅ Employee created\n`);
    }
    
    // Assign COMPANY_ADMIN role for full permissions
    const adminRole = await prisma.role.findFirst({
      where: { 
        name: 'COMPANY_ADMIN',
        companyId: user.companyId
      }
    });
    
    if (adminRole) {
      // Update user role
      await prisma.user.update({
        where: { id: user.id },
        data: { roleId: adminRole.id }
      });
      console.log(`✅ Assigned COMPANY_ADMIN role\n`);
    }
    
    console.log('TEST USER READY FOR VALIDATION:');
    console.log('  Email: steptest@test.local');
    console.log('  Password: test123456');
    console.log('  Role: COMPANY_ADMIN');
    console.log('  Permissions: Full access');
    console.log('');
    
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

setupPermissions();
