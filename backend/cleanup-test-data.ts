/**
 * Cleanup Test Data Script
 * Removes all test accounts, teams, shifts, leaves, and related data
 * Keeps only essential production setup
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanupTestData() {
  console.log("🧹 Starting cleanup of test data...\n");

  try {
    // 1. Delete test users
    console.log("1️⃣ Deleting test users...");
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { contains: "test" } },
          { email: { contains: "validation" } },
          { username: { contains: "test" } },
          { email: "demo@example.com" },
          { email: "admin@example.com" },
        ],
      },
    });
    console.log(`   ✓ Deleted ${deletedUsers.count} test users\n`);

    // 2. Delete test leaves
    console.log("2️⃣ Deleting test leaves...");
    const deletedLeaves = await prisma.leave.deleteMany({
      where: {
        OR: [
          { reason: { contains: "test" } },
          { reason: { contains: "TEST" } },
        ],
      },
    });
    console.log(`   ✓ Deleted ${deletedLeaves.count} test leaves\n`);

    // 3. Delete test rosters (this will cascade delete roster details)
    console.log("3️⃣ Deleting test rosters and assignments...");
    const deletedRosters = await prisma.roster.deleteMany({
      where: {
        workGroup: {
          name: { contains: "test" },
        },
      },
    });
    console.log(`   ✓ Deleted ${deletedRosters.count} test rosters\n`);

    // 4. Delete test attendances
    console.log("4️⃣ Deleting test attendance records...");
    const deletedAttendances = await prisma.attendance.deleteMany({
      where: {
        employee: {
          name: { contains: "test" },
        },
      },
    });
    console.log(`   ✓ Deleted ${deletedAttendances.count} test attendance records\n`);

    // 5. Delete test employees
    console.log("5️⃣ Deleting test employees...");
    const deletedEmployees = await prisma.employee.deleteMany({
      where: {
        OR: [
          { email: { contains: "test" } },
          { employeeNo: { contains: "TEST" } },
          { name: { contains: "Test" } },
        ],
      },
    });
    console.log(`   ✓ Deleted ${deletedEmployees.count} test employees\n`);

    // 6. Delete test teams/work groups
    console.log("6️⃣ Deleting test teams/work groups...");
    const deletedWorkGroups = await prisma.workGroup.deleteMany({
      where: {
        OR: [
          { name: { contains: "test" } },
          { name: { contains: "TEST" } },
          { description: { contains: "test" } },
        ],
      },
    });
    console.log(`   ✓ Deleted ${deletedWorkGroups.count} test teams\n`);

    // 7. Delete test shift templates
    console.log("7️⃣ Deleting test shift templates...");
    const deletedShifts = await prisma.shiftTemplate.deleteMany({
      where: {
        OR: [
          { name: { contains: "test" } },
          { name: { contains: "TEST" } },
          { code: { contains: "TEST" } },
        ],
      },
    });
    console.log(`   ✓ Deleted ${deletedShifts.count} test shift templates\n`);

    // 8. Delete test departments
    console.log("8️⃣ Deleting test departments...");
    const deletedDepts = await prisma.department.deleteMany({
      where: {
        OR: [
          { name: { contains: "test" } },
          { name: { contains: "TEST" } },
          { code: { contains: "TEST" } },
        ],
      },
    });
    console.log(`   ✓ Deleted ${deletedDepts.count} test departments\n`);

    // 9. Delete test companies (only if they're marked as test)
    console.log("9️⃣ Deleting test companies...");
    const deletedCompanies = await prisma.company.deleteMany({
      where: {
        OR: [
          { name: { contains: "test" } },
          { name: { contains: "TEST" } },
          { code: { contains: "TEST" } },
        ],
      },
    });
    console.log(`   ✓ Deleted ${deletedCompanies.count} test companies\n`);

    console.log("✅ Cleanup completed successfully!\n");
    console.log("📊 Summary:");
    console.log(`   - Users deleted: ${deletedUsers.count}`);
    console.log(`   - Leaves deleted: ${deletedLeaves.count}`);
    console.log(`   - Rosters deleted: ${deletedRosters.count}`);
    console.log(`   - Attendance records deleted: ${deletedAttendances.count}`);
    console.log(`   - Employees deleted: ${deletedEmployees.count}`);
    console.log(`   - Teams deleted: ${deletedWorkGroups.count}`);
    console.log(`   - Shifts deleted: ${deletedShifts.count}`);
    console.log(`   - Departments deleted: ${deletedDepts.count}`);
    console.log(`   - Companies deleted: ${deletedCompanies.count}`);
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupTestData()
  .then(() => {
    console.log("\n🎉 All test data has been cleaned up!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Cleanup failed:", error);
    process.exit(1);
  });
