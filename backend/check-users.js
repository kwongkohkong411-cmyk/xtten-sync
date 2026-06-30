const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    // Get all auth info
    const users = await prisma.user.findMany({ take: 15 });
    console.log('Users in database:');
    users.forEach(u => {
      const hasPwd = !!u.password;
      console.log(`  ${u.email || u.username} - Pwd: ${hasPwd ? 'YES ('+u.password.substring(0,10)+'...)' : 'NO'}, Role: ${u.role}`);
    });
    
  } catch (e) {
    console.log('DB Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
