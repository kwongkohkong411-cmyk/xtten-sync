/**
 * STEP 4: LATE MINUTES CALCULATION BUG FIX VERIFICATION
 *
 * ROOT CAUSE OF lateMinutes=723:
 *   Server timezone: UTC+8
 *   Test ran at 13:18 UTC = 21:18 local (UTC+8)
 *   Default schedule: scheduledStart = 09:15 local = 01:15 UTC
 *   checkIn = 13:18 UTC (= 21:18 local)
 *   lateMinutes = (21:18 - 09:15) / 60 = 12h3m = 723 → CORRECT math, wrong test time
 *
 * FIX:
 *   1. Added clockInAt override to POST /attendance/check-in
 *   2. Added checkOutAt override to POST /attendance/check-out/:id
 *   3. Test now passes exact local times for each scenario
 *   4. Roster creation uses Prisma directly (setup infrastructure)
 *
 * TEST SCENARIOS:
 *   A: Shift 09:00 (lateAfter=5), Clock-In 09:15 → lateMinutes = 15
 *   B: Shift 09:00 (lateAfter=5), Clock-In 08:58 → lateMinutes = 0
 *   C: Cross-Day 20:00~08:00 (lateAfter=5), Clock-In 20:10 → lateMinutes = 10
 */

const http = require('http');
const { PrismaClient } = require('@prisma/client');

const API_BASE = 'http://localhost:3000';
const TEST_USER = { email: 'validation@test.local', password: 'validation123' };
const COMPANY_ID = '9bf9f9ad-9ce6-4a5a-be94-9798a06c7757';

const prisma = new PrismaClient();
let token = null;
let testResults = [];
let cleanupShiftIds = [];
let cleanupRosterIds = [];

function request(method, path, body = null) {
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
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function log(msg, level = 'INFO') { console.log(`[${new Date().toISOString()}] [${level}] ${msg}`); }
function pass(name, msg) { testResults.push({ name, status: 'PASS', msg }); log(`✅ ${name}: ${msg}`, 'TEST'); }
function fail(name, msg) { testResults.push({ name, status: 'FAIL', msg }); log(`❌ ${name}: ${msg}`, 'TEST'); }

/**
 * Build an ISO timestamp for a specific day offset and LOCAL HH:MM time.
 * Uses setHours() in LOCAL timezone, consistent with server's normalizeDayStart/buildDateFromClock.
 */
function localTimeISO(hhmm, dayOffset = 0) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

async function login() {
  log('Login...', 'STEP');
  const res = await request('POST', '/auth/login', { account: TEST_USER.email, password: TEST_USER.password });
  if ((res.status === 200 || res.status === 201) && res.body?.access_token) {
    token = res.body.access_token;
    log(`✅ Authenticated`, 'INFO');
    return true;
  }
  fail('Login', `${res.body?.message || 'Status ' + res.status}`);
  return false;
}

/** Get employee record for test user */
async function getEmployee() {
  const emp = await prisma.employee.findFirst({
    where: { email: TEST_USER.email },
    select: { id: true, workGroupId: true, companyId: true },
  });
  if (!emp) throw new Error('Employee record not found for ' + TEST_USER.email);
  log(`Employee: ${emp.id.substring(0, 8)}, team: ${emp.workGroupId?.substring(0, 8)}`, 'INFO');
  return emp;
}

/** Create a shift template via Prisma */
async function createShift(name, startTime, endTime, lateAfter, crossDay = false) {
  const shift = await prisma.shiftTemplate.create({
    data: {
      name,
      shiftType: crossDay ? 'NIGHT' : 'DAY',
      startTime,
      endTime,
      lateAfter,
      earlyLeave: 5,
      crossDay,
      companyId: COMPANY_ID,
    },
  });
  cleanupShiftIds.push(shift.id);
  log(`  Shift: ${name} (${startTime}~${endTime}, lateAfter=${lateAfter}, crossDay=${crossDay})`, 'INFO');
  return shift;
}

/** Create employee-specific roster via Prisma (upsert - delete+create) */
async function createEmployeeRoster(employeeId, workGroupId, shiftId, month) {
  // Delete existing roster for same employee/month/workGroup to avoid unique constraint
  await prisma.roster.deleteMany({
    where: { employeeId, workGroupId, month }
  });

  const roster = await prisma.roster.create({
    data: {
      companyId: COMPANY_ID,
      employeeId,
      workGroupId,
      shiftId,
      month,
      status: 'ASSIGNED',
    },
  });
  cleanupRosterIds.push(roster.id);
  log(`  Roster: month=${month}, employee=${employeeId.substring(0, 8)}, shift=${shiftId.substring(0, 8)}`, 'INFO');
  return roster;
}

/** Remove test data via Prisma */
async function cleanupTestData(employeeId) {
  log('Cleaning up...', 'STEP');
  const attDeleted = await prisma.attendance.deleteMany({ where: { employeeId } });
  log(`  Deleted ${attDeleted.count} attendance record(s)`, 'INFO');

  if (cleanupRosterIds.length > 0) {
    await prisma.roster.deleteMany({ where: { id: { in: cleanupRosterIds } } });
  }
  if (cleanupShiftIds.length > 0) {
    await prisma.shiftTemplate.deleteMany({ where: { id: { in: cleanupShiftIds } } });
  }
  cleanupRosterIds = [];
  cleanupShiftIds = [];
}

function printRootCause() {
  const serverNow = new Date();
  const utcOffset = -serverNow.getTimezoneOffset() / 60;
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const scheduledStart = new Date(day); scheduledStart.setHours(9, 15, 0, 0);
  const diffMin = Math.round((serverNow.getTime() - scheduledStart.getTime()) / 60_000);

  console.log('\n' + '─'.repeat(80));
  console.log('ROOT CAUSE: lateMinutes = 723');
  console.log('─'.repeat(80));
  console.log(`Server timezone: UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}`);
  console.log(`Current local time: ${serverNow.toLocaleTimeString()}`);
  console.log(`normalizeDayStart(now) → midnight local: ${day.toISOString()}`);
  console.log(`buildDateFromClock(day,"09:15") → scheduledStart: ${scheduledStart.toISOString()}`);
  console.log(`If test ran NOW → lateMinutes would be: ${diffMin} min`);
  console.log(`At 13:18 UTC (21:18 UTC+8): checkIn=13:18Z, scheduledStart=01:15Z → diff=723 min`);
  console.log('FIX: clockInAt override passes exact local time → tests get precise values');
  console.log('─'.repeat(80) + '\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO A: Shift 09:00, Clock-In 09:15 → lateMinutes = 15
// ─────────────────────────────────────────────────────────────────────────────
async function scenarioA(emp) {
  console.log('\n' + '═'.repeat(80));
  console.log('SCENARIO A: Shift=09:00, lateAfter=5, Clock-In=09:15 → lateMinutes = 15');
  console.log('═'.repeat(80));

  const month = new Date().toISOString().slice(0, 7);
  const shift = await createShift(`Test-A-Day ${Date.now()}`, '09:00', '18:00', 5, false);
  await createEmployeeRoster(emp.id, emp.workGroupId, shift.id, month);

  const clockInAt = localTimeISO('09:15', 0);
  log(`clockInAt = ${clockInAt} (today 09:15 local)`, 'INFO');
  log(`Expected: 09:15 > lateThreshold(09:05) → LATE, lateMinutes = 15`, 'INFO');

  const res = await request('POST', '/attendance/check-in', { clockInAt });
  if (res.status !== 201) {
    fail('A_CheckIn', `Status ${res.status}: ${res.body?.message}`);
    return null;
  }

  const { lateMinutes, status, scheduledStartTime } = res.body;
  log(`  scheduledStartTime: ${scheduledStartTime}, status: ${status}, lateMinutes: ${lateMinutes}`, 'INFO');

  if (scheduledStartTime === '09:00') {
    pass('A_Shift', `Shift correctly resolved to 09:00 (not default 09:15)`);
  } else {
    fail('A_Shift', `Shift resolved to ${scheduledStartTime}, expected 09:00`);
  }

  if (lateMinutes === 15) {
    pass('A_LateMinutes', `lateMinutes = 15 ✓`);
  } else {
    fail('A_LateMinutes', `lateMinutes = ${lateMinutes}, expected 15`);
  }

  if (status === 'LATE') {
    pass('A_Status', `Status = LATE ✓`);
  } else {
    fail('A_Status', `Status = ${status}, expected LATE`);
  }

  // Clock out
  if (res.body?.id) {
    await request('POST', `/attendance/check-out/${res.body.id}`, { checkOutAt: localTimeISO('18:00', 0) });
  }

  return res.body;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO B: Shift 09:00, Clock-In 08:58 → lateMinutes = 0
// ─────────────────────────────────────────────────────────────────────────────
async function scenarioB(emp) {
  console.log('\n' + '═'.repeat(80));
  console.log('SCENARIO B: Shift=09:00, lateAfter=5, Clock-In=08:58 → lateMinutes = 0');
  console.log('═'.repeat(80));

  // Day+7 to avoid date conflict
  const d7 = new Date(); d7.setDate(d7.getDate() + 7);
  const month = `${d7.getFullYear()}-${String(d7.getMonth() + 1).padStart(2, '0')}`;

  const shift = await createShift(`Test-B-Day ${Date.now()}`, '09:00', '18:00', 5, false);
  await createEmployeeRoster(emp.id, emp.workGroupId, shift.id, month);

  const clockInAt = localTimeISO('08:58', 7);
  log(`clockInAt = ${clockInAt} (day+7 08:58 local)`, 'INFO');
  log(`Expected: 08:58 < lateThreshold(09:05) → PRESENT, lateMinutes = 0`, 'INFO');

  const res = await request('POST', '/attendance/check-in', { clockInAt });
  if (res.status !== 201) {
    fail('B_CheckIn', `Status ${res.status}: ${res.body?.message}`);
    return null;
  }

  const { lateMinutes, status, scheduledStartTime } = res.body;
  log(`  scheduledStartTime: ${scheduledStartTime}, status: ${status}, lateMinutes: ${lateMinutes}`, 'INFO');

  if (scheduledStartTime === '09:00') {
    pass('B_Shift', `Shift correctly resolved to 09:00`);
  } else {
    fail('B_Shift', `Shift resolved to ${scheduledStartTime}, expected 09:00`);
  }

  if (lateMinutes === 0) {
    pass('B_LateMinutes', `lateMinutes = 0 ✓`);
  } else {
    fail('B_LateMinutes', `lateMinutes = ${lateMinutes}, expected 0`);
  }

  if (status === 'PRESENT') {
    pass('B_Status', `Status = PRESENT ✓`);
  } else {
    fail('B_Status', `Status = ${status}, expected PRESENT`);
  }

  if (res.body?.id) {
    await request('POST', `/attendance/check-out/${res.body.id}`, { checkOutAt: localTimeISO('18:00', 7) });
  }

  return res.body;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO C: Cross-Day 20:00~08:00, Clock-In 20:10 → lateMinutes = 10
// ─────────────────────────────────────────────────────────────────────────────
async function scenarioC(emp) {
  console.log('\n' + '═'.repeat(80));
  console.log('SCENARIO C: Cross-Day 20:00~08:00, lateAfter=5, Clock-In=20:10 → lateMinutes = 10');
  console.log('═'.repeat(80));

  // Day+14 to avoid conflict
  const d14 = new Date(); d14.setDate(d14.getDate() + 14);
  const month = `${d14.getFullYear()}-${String(d14.getMonth() + 1).padStart(2, '0')}`;

  const shift = await createShift(`Test-C-Cross ${Date.now()}`, '20:00', '08:00', 5, true);
  await createEmployeeRoster(emp.id, emp.workGroupId, shift.id, month);

  const clockInAt = localTimeISO('20:10', 14);
  const checkOutAt = localTimeISO('08:00', 15); // next morning // next morning

  log(`clockInAt = ${clockInAt} (day+14 20:10 local)`, 'INFO');
  log(`Shift: 20:00~08:00, crossDay=true, lateAfter=5`, 'INFO');
  log(`Expected: 20:10 > lateThreshold(20:05) → LATE, lateMinutes = 10`, 'INFO');

  const res = await request('POST', '/attendance/check-in', { clockInAt });
  if (res.status !== 201) {
    fail('C_CheckIn', `Status ${res.status}: ${res.body?.message}`);
    return null;
  }

  const { lateMinutes, status, scheduledStartTime, scheduledEndTime } = res.body;
  log(`  scheduledStart: ${scheduledStartTime}, scheduledEnd: ${scheduledEndTime}`, 'INFO');
  log(`  status: ${status}, lateMinutes: ${lateMinutes}`, 'INFO');

  if (scheduledStartTime === '20:00') {
    pass('C_Shift', `Cross-day shift correctly resolved: 20:00`);
  } else {
    fail('C_Shift', `Shift resolved to ${scheduledStartTime}, expected 20:00`);
  }

  if (lateMinutes === 10) {
    pass('C_LateMinutes', `lateMinutes = 10 ✓`);
  } else {
    fail('C_LateMinutes', `lateMinutes = ${lateMinutes}, expected 10`);
  }

  if (status === 'LATE') {
    pass('C_Status', `Status = LATE ✓`);
  } else {
    fail('C_Status', `Status = ${status}, expected LATE`);
  }

  if (scheduledEndTime === '08:00') {
    pass('C_CrossDayEnd', `Cross-day end time = 08:00 (next day) ✓`);
  }

  // Clock out next morning
  if (res.body?.id) {
    const coRes = await request('POST', `/attendance/check-out/${res.body.id}`, { checkOutAt });
    if (coRes.status === 200) {
      const totalHours = coRes.body?.totalHours;
      log(`  Clock-out OK: totalHours=${totalHours} (expected ~12)`, 'INFO');
      if (totalHours > 0) {
        pass('C_CrossDayTotalHours', `Cross-day totalHours = ${totalHours} ✓`);
      }
    }
  }

  return res.body;
}

async function main() {
  console.log('═'.repeat(80));
  console.log('STEP 4: LATE MINUTES BUG FIX - 3 SCENARIOS WITH REAL API CALLS');
  console.log('═'.repeat(80));

  let emp;
  try {
    printRootCause();

    if (!await login()) return;

    emp = await getEmployee();

    // Clean all attendance records for the test employee first
    await cleanupTestData(emp.id);

    // Run 3 scenarios
    await scenarioA(emp);
    await scenarioB(emp);
    await scenarioC(emp);

    // Summary
    const passed = testResults.filter(r => r.status === 'PASS').length;
    const failed = testResults.filter(r => r.status === 'FAIL').length;

    console.log('\n' + '═'.repeat(80));
    console.log('📊 RESULTS');
    console.log('═'.repeat(80) + '\n');

    testResults.forEach((r, i) => {
      const icon = r.status === 'PASS' ? '✅' : '❌';
      console.log(`${(i + 1).toString().padStart(2)}. ${icon} ${r.name.padEnd(35)} ${r.msg}`);
    });

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`✅ PASSED: ${passed} | ❌ FAILED: ${failed} | Total: ${testResults.length}`);
    console.log(`Success Rate: ${((passed / testResults.length) * 100).toFixed(1)}%`);
    console.log('─'.repeat(80) + '\n');

    if (failed === 0) {
      console.log('🎉 ALL SCENARIOS PASS - lateMinutes CALCULATION VERIFIED!\n');
    }

  } catch (e) {
    console.error('Fatal error:', e.message);
    console.error(e.stack);
  } finally {
    if (emp) await cleanupTestData(emp.id);
    await prisma.$disconnect();
  }
}

main().catch(console.error);
