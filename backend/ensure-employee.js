/**
 * Check if employee record exists for validation@test.local
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function check() {
  try {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: 'validation@test.local' },
      include: {
        employee: true,
        roleRelation: true,
      }
    });

    console.log('User:', user?.email);
    console.log('  - ID:', user?.id?.substring(0, 8));
    console.log('  - Role ID:', user?.roleId?.substring(0, 8) || 'NULL');
    console.log('  - Employee ID:', user?.employee?.id?.substring(0, 8) || 'NULL (NO EMPLOYEE)');
    console.log('  - Employee Name:', user?.employee?.name || 'N/A');
    console.log('  - Employee Team:', user?.employee?.workGroupId?.substring(0, 8) || 'NULL');
    console.log('  - Role (string):', user?.role);

    if (!user?.employee) {
      console.log('\n⚠️  No employee record! Creating one now...\n');
      
      // Get team
      const team = await prisma.workGroup.findFirst({
        where: { name: 'A morning' }
      });

      // Create employee
      const emp = await prisma.employee.create({
        data: {
          name: user.name,
          email: user.email,
          companyId: user.companyId,
          userId: user.id,
          workGroupId: team?.id || null,
          status: 'ACTIVE',
        }
      });

      console.log('✅ Employee created:');
      console.log('  - ID:', emp.id.substring(0, 8));
      console.log('  - Name:', emp.name);
      console.log('  - Team:', emp.workGroupId?.substring(0, 8));
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
