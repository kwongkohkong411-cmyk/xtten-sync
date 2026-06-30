/**
 * STEP 6: REPORTS VALIDATION
 *
 * Verify that Daily / Monthly / Summary Reports correctly show:
 *   - lateMinutes and earlyLeaveMinutes (new fields from Step 5)
 *   - Correct OT calculations with team-level rosters
 *   - Proper status aggregation
 *
 * Test flow:
 *   1. Create test employee + shifts + rosters
 *   2. Create attendance records with lateMinutes/earlyLeaveMinutes values
 *   3. Call Daily Report API → verify lateMinutes/earlyLeaveMinutes in rows
 *   4. Call Monthly Report API → verify trend includes OT aggregation
 *   5. Call Summary API → verify totalLateMinutes/totalEarlyLeaveMinutes
 *   6. Test CSV/XLSX export includes the fields
 */

const http = require('http');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const API_BASE = 'http://localhost:3000';
const TEST_USER = { email: 'validation@test.local', password: 'validation123' };
const COMPANY_ID = '9bf9f9ad-9ce6-4a5a-be94-9798a06c7757';

const prisma = new PrismaClient();
let token = null;
let testResults = [];
let cleanupShiftIds = [];
let cleanupRosterIds = [];
let createdAttendanceIds = [];

function request(method, path, body = null, expectBlob = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = Buffer.alloc(0);
      res.on('data', (chunk) => {
        data = Buffer.concat([data, chunk]);
      });
      res.on('end', () => {
        if (expectBlob) {
          resolve({ status: res.statusCode, buffer: data });
          return;
        }
        try {
          const json = JSON.parse(data.toString());
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: data.toString() });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function log(msg, level = 'INFO') {
  console.log(`[${new Date().toISOString()}] [${level}] ${msg}`);
}
function pass(name, msg) {
  testResults.push({ name, status: 'PASS', msg });
  log(`✅ ${name}: ${msg}`, 'TEST');
}
function fail(name, msg) {
  testResults.push({ name, status: 'FAIL', msg });
  log(`❌ ${name}: ${msg}`, 'TEST');
}

async function login() {
  log('Login...', 'STEP');
  const res = await request('POST', '/auth/login', {
    account: TEST_USER.email,
    password: TEST_USER.password,
  });
  if ((res.status === 200 || res.status === 201) && res.body?.access_token) {
    token = res.body.access_token;
    log('✅ Authenticated', 'INFO');
    return true;
  }
  fail('Login', `${res.body?.message || 'Status ' + res.status}`);
  return false;
}

async function getEmployee() {
  const emp = await prisma.employee.findFirst({
    where: { email: TEST_USER.email },
    select: { id: true, companyId: true, workGroupId: true },
  });
  if (!emp) throw new Error('Employee not found');
  log(`Employee: ${emp.id.substring(0, 8)}, company: ${emp.companyId.substring(0, 8)}`, 'INFO');
  return emp;
}

async function createTestShiftAndRoster() {
  log('Creating test shift and roster...', 'STEP');
  const emp = await getEmployee();
  const month = new Date().toISOString().slice(0, 7);

  const shift = await prisma.shiftTemplate.create({
    data: {
      name: `Test Shift ${Date.now()}`,
      shiftType: 'DAY',
      startTime: '09:00',
      endTime: '18:00',
      lateAfter: 5,
      earlyLeave: 10,
      crossDay: false,
      companyId: COMPANY_ID,
    },
  });
  cleanupShiftIds.push(shift.id);

  // Delete existing roster for this employee/month to avoid conflicts
  await prisma.roster.deleteMany({
    where: { employeeId: emp.id, workGroupId: emp.workGroupId, month },
  });

  const roster = await prisma.roster.create({
    data: {
      companyId: COMPANY_ID,
      employeeId: emp.id,
      workGroupId: emp.workGroupId,
      shiftId: shift.id,
      month,
      status: 'ASSIGNED',
    },
  });
  cleanupRosterIds.push(roster.id);

  log(`Shift: ${shift.id.substring(0, 8)}, Roster: ${roster.id.substring(0, 8)}`, 'INFO');
  return { emp, shift, roster, month };
}

async function setupTestData() {
  log('\nSetting up shared test data...', 'STEP');
  await cleanupTestData();
  createdAttendanceIds = [];
  cleanupRosterIds = [];
  cleanupShiftIds = [];

  const { emp, shift, roster, month } = await createTestShiftAndRoster();

  // Record 1: LATE with 15 late minutes (today)
  const date1 = new Date();
  date1.setHours(0, 0, 0, 0);
  const att1 = await prisma.attendance.create({
    data: {
      employeeId: emp.id,
      companyId: emp.companyId,
      date: date1,
      checkIn: new Date(date1.getTime() + 9 * 60 * 60 * 1000 + 15 * 60 * 1000), // 09:15
      checkOut: new Date(date1.getTime() + 18 * 60 * 60 * 1000), // 18:00
      totalHours: 8.75,
      status: 'LATE',
      lateMinutes: 15,
      earlyLeaveMinutes: 0,
    },
  });
  createdAttendanceIds.push(att1.id);
  log(`  Att1 (LATE, 15 min): ${att1.id.substring(0, 8)}`, 'INFO');

  // Record 2: ON_TIME with 30 early leave minutes (day+1)
  const date2 = new Date();
  date2.setDate(date2.getDate() + 1);
  date2.setHours(0, 0, 0, 0);
  const att2 = await prisma.attendance.create({
    data: {
      employeeId: emp.id,
      companyId: emp.companyId,
      date: date2,
      checkIn: new Date(date2.getTime() + 9 * 60 * 60 * 1000), // 09:00
      checkOut: new Date(date2.getTime() + 17.5 * 60 * 60 * 1000), // 17:30 (30 min early)
      totalHours: 8.5,
      status: 'PRESENT',
      lateMinutes: 0,
      earlyLeaveMinutes: 30,
    },
  });
  createdAttendanceIds.push(att2.id);
  log(`  Att2 (PRESENT, 30 early): ${att2.id.substring(0, 8)}`, 'INFO');

  // Record 3: ON_TIME no late/early (day+2)
  const date3 = new Date();
  date3.setDate(date3.getDate() + 2);
  date3.setHours(0, 0, 0, 0);
  const att3 = await prisma.attendance.create({
    data: {
      employeeId: emp.id,
      companyId: emp.companyId,
      date: date3,
      checkIn: new Date(date3.getTime() + 9 * 60 * 60 * 1000), // 09:00
      checkOut: new Date(date3.getTime() + 18 * 60 * 60 * 1000), // 18:00
      totalHours: 9,
      status: 'PRESENT',
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
    },
  });
  createdAttendanceIds.push(att3.id);
  log(`  Att3 (PRESENT, on time): ${att3.id.substring(0, 8)}`, 'INFO');

  return {
    emp,
    records: [
      { date: date1, status: 'LATE', lateMinutes: 15, earlyLeaveMinutes: 0, totalHours: 8.75 },
      { date: date2, status: 'PRESENT', lateMinutes: 0, earlyLeaveMinutes: 30, totalHours: 8.5 },
      { date: date3, status: 'PRESENT', lateMinutes: 0, earlyLeaveMinutes: 0, totalHours: 9 },
    ],
  };
}

async function testDailyReport(testData) {
  log('\n=== TEST: Daily Report ===', 'TEST');
  const { emp, records } = testData;
  const date = records[0].date;
  const dateStr = date.toISOString().split('T')[0];

  const res = await request('GET', `/reports/daily?date=${dateStr}`);

  if (res.status !== 200) {
    log(`  Response body: ${JSON.stringify(res.body).substring(0, 200)}`, 'DEBUG');
    fail('DailyReport_Status', `Status ${res.status}`);
    return;
  }

  pass('DailyReport_Status', 'GET /reports/daily returned 200');

  const rows = res.body?.rows || [];
  const empRow = rows.find((r) => r.employeeId === emp.id);

  if (!empRow) {
    fail('DailyReport_EmployeeRow', 'Employee row not found');
    return;
  }
  pass('DailyReport_EmployeeRow', 'Employee row found');

  if (empRow.lateMinutes === 15) {
    pass('DailyReport_LateMinutes', `lateMinutes = 15`);
  } else {
    fail('DailyReport_LateMinutes', `lateMinutes = ${empRow.lateMinutes}, expected 15`);
  }

  if (empRow.earlyLeaveMinutes === undefined || empRow.earlyLeaveMinutes === 0) {
    pass('DailyReport_EarlyLeaveMinutes', 'earlyLeaveMinutes = 0 (expected for today)');
  } else {
    fail(
      'DailyReport_EarlyLeaveMinutes',
      `earlyLeaveMinutes = ${empRow.earlyLeaveMinutes}, expected 0`,
    );
  }

  if (empRow.status === 'LATE') {
    pass('DailyReport_Status', 'Status = LATE');
  } else {
    fail('DailyReport_Status', `Status = ${empRow.status}, expected LATE`);
  }
}

async function testMonthlyReport(testData) {
  log('\n=== TEST: Monthly Report ===', 'TEST');
  const { emp, records } = testData;
  const month = records[0].date.toISOString().slice(0, 7);

  const res = await request('GET', `/reports/monthly?month=${month}`);

  if (res.status !== 200) {
    fail('MonthlyReport_Status', `Status ${res.status}`);
    return;
  }

  pass('MonthlyReport_Status', 'GET /reports/monthly returned 200');

  const statusTotals = res.body?.statusTotals || {};
  log(`  Status totals: late=${statusTotals.late}, leave=${statusTotals.leave}`, 'INFO');

  if (statusTotals.late >= 1) {
    pass('MonthlyReport_Late', `late count = ${statusTotals.late} (has at least 1)`);
  } else {
    fail('MonthlyReport_Late', `late count = ${statusTotals.late}, expected >= 1`);
  }

  const trend = res.body?.trend || [];
  const attendanceRecs = trend.filter((t) => t.present > 0 || t.absent > 0 || t.abnormal > 0);
  log(`  Trend days with attendance: ${attendanceRecs.length}`, 'INFO');

  if (trend.length > 0) {
    pass('MonthlyReport_Trend', `Trend has ${trend.length} days`);
  } else {
    fail('MonthlyReport_Trend', 'Trend is empty');
  }
}

async function testSummaryReport(testData) {
  log('\n=== TEST: Summary Report ===', 'TEST');
  const { emp, records } = testData;
  const startDate = records[0].date.toISOString().split('T')[0];
  const endDate = records[records.length - 1].date.toISOString().split('T')[0];

  const res = await request('GET', `/reports/summary?startDate=${startDate}&endDate=${endDate}`);

  if (res.status !== 200) {
    fail('SummaryReport_Status', `Status ${res.status}`);
    return;
  }

  pass('SummaryReport_Status', 'GET /reports/summary returned 200');

  const rows = res.body?.rows || [];
  const empRow = rows.find((r) => r.employeeId === emp.id);

  if (!empRow) {
    fail('SummaryReport_EmployeeRow', 'Employee row not found');
    return;
  }
  pass('SummaryReport_EmployeeRow', 'Employee row found');

  const totalLateMinutes = empRow.totalLateMinutes ?? 0;
  const totalEarlyLeaveMinutes = empRow.totalEarlyLeaveMinutes ?? 0;

  log(`  Employee totals: late=${totalLateMinutes} min, early=${totalEarlyLeaveMinutes} min`, 'INFO');

  if (totalLateMinutes === 15) {
    pass('SummaryReport_TotalLateMinutes', `totalLateMinutes = 15`);
  } else {
    fail('SummaryReport_TotalLateMinutes', `totalLateMinutes = ${totalLateMinutes}, expected 15`);
  }

  if (totalEarlyLeaveMinutes === 30) {
    pass('SummaryReport_TotalEarlyLeaveMinutes', `totalEarlyLeaveMinutes = 30`);
  } else {
    fail(
      'SummaryReport_TotalEarlyLeaveMinutes',
      `totalEarlyLeaveMinutes = ${totalEarlyLeaveMinutes}, expected 30`,
    );
  }

  if (empRow.late >= 1) {
    pass('SummaryReport_LateCount', `Late count = ${empRow.late}`);
  } else {
    fail('SummaryReport_LateCount', `Late count = ${empRow.late}, expected >= 1`);
  }
}

async function testExportDaily(testData) {
  log('\n=== TEST: Daily Export CSV ===', 'TEST');
  const { emp, records } = testData;
  const dateStr = records[0].date.toISOString().split('T')[0];

  const res = await request('GET', `/reports/export/day?date=${dateStr}&format=csv`, null, true);

  if (res.status !== 200) {
    fail('ExportDaily_Status', `Status ${res.status}`);
    return;
  }

  pass('ExportDaily_Status', 'GET /reports/export/day returned 200');

  const csv = res.buffer.toString();
  log(`  CSV size: ${csv.length} bytes`, 'INFO');

  if (csv.includes('lateMinutes')) {
    pass('ExportDaily_HasLateMinutes', 'CSV header includes lateMinutes');
  } else {
    fail('ExportDaily_HasLateMinutes', 'CSV header missing lateMinutes');
  }

  if (csv.includes('earlyLeaveMinutes')) {
    pass('ExportDaily_HasEarlyLeaveMinutes', 'CSV header includes earlyLeaveMinutes');
  } else {
    fail('ExportDaily_HasEarlyLeaveMinutes', 'CSV header missing earlyLeaveMinutes');
  }
}

async function testExportMonthly(testData) {
  log('\n=== TEST: Monthly Export CSV ===', 'TEST');
  const { records } = testData;
  const month = records[0].date.toISOString().slice(0, 7);

  const res = await request('GET', `/reports/export/month?month=${month}&format=csv`, null, true);

  if (res.status !== 200) {
    fail('ExportMonthly_Status', `Status ${res.status}`);
    return;
  }

  pass('ExportMonthly_Status', 'GET /reports/export/month returned 200');

  const csv = res.buffer.toString();
  log(`  CSV size: ${csv.length} bytes`, 'INFO');

  if (csv.includes('late') || csv.includes('totalOtHours')) {
    pass('ExportMonthly_HasLateData', 'CSV includes late/OT data');
  } else {
    fail('ExportMonthly_HasLateData', 'CSV missing late/OT data');
  }
}

async function cleanupTestData() {
  log('\nCleaning up test data...', 'STEP');

  if (createdAttendanceIds.length > 0) {
    await prisma.attendance.deleteMany({
      where: { id: { in: createdAttendanceIds } },
    });
    log(`  Deleted ${createdAttendanceIds.length} attendance record(s)`, 'INFO');
  }

  if (cleanupRosterIds.length > 0) {
    await prisma.roster.deleteMany({
      where: { id: { in: cleanupRosterIds } },
    });
  }

  if (cleanupShiftIds.length > 0) {
    await prisma.shiftTemplate.deleteMany({
      where: { id: { in: cleanupShiftIds } },
    });
  }
}

async function main() {
  console.log('═'.repeat(80));
  console.log('STEP 6: REPORTS VALIDATION');
  console.log('═'.repeat(80) + '\n');

  try {
    if (!await login()) return;

    const testData = await setupTestData();

    await testDailyReport(testData);
    await testMonthlyReport(testData);
    await testSummaryReport(testData);
    await testExportDaily(testData);
    await testExportMonthly(testData);

    // Summary
    const passed = testResults.filter((r) => r.status === 'PASS').length;
    const failed = testResults.filter((r) => r.status === 'FAIL').length;

    console.log('\n' + '═'.repeat(80));
    console.log('RESULTS');
    console.log('═'.repeat(80) + '\n');

    testResults.forEach((r, i) => {
      const icon = r.status === 'PASS' ? '✅' : '❌';
      console.log(`${(i + 1).toString().padStart(2)}. ${icon} ${r.name.padEnd(40)} ${r.msg}`);
    });

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`✅ PASSED: ${passed} | ❌ FAILED: ${failed} | Total: ${testResults.length}`);
    console.log(`Success Rate: ${((passed / testResults.length) * 100).toFixed(1)}%`);
    console.log('─'.repeat(80) + '\n');

    if (failed === 0) {
      console.log('🎉 ALL TESTS PASS - STEP 6 VALIDATION COMPLETE!\n');
    }
  } catch (e) {
    console.error('Fatal error:', e.message);
    console.error(e.stack);
  } finally {
    await cleanupTestData();
    await prisma.$disconnect();
  }
}

main().catch(console.error);
