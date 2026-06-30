const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const users = await prisma.user.findMany({ take: 10 });
    console.log('Users in database:', users.length);
    users.forEach(u => console.log(`  - ${u.email} (${u.username})`));
    
    if (users.length === 0) {
      console.log('\nNo users found. Cannot proceed.');
    }
    
    const companies = await prisma.company.findMany({ take: 3 });
    console.log('\nCompanies:', companies.length);
    companies.forEach(c => console.log(`  - ${c.name} (${c.id.substring(0, 8)})`));
    
  } catch (e) {
    console.log('DB Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
