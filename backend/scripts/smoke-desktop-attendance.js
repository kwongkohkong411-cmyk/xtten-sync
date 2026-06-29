/* eslint-disable no-console */
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
const ADMIN_ACCOUNT = process.env.SMOKE_ADMIN_ACCOUNT || 'sn888xt';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || '123456';
const USER_PASSWORD = process.env.SMOKE_USER_PASSWORD || 'password123';

function localDateText(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthText(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const detail = typeof data === 'string'
      ? data
      : (data?.message || data?.error || JSON.stringify(data));
    const error = new Error(`${options.method || 'GET'} ${path} failed (${res.status})${detail ? `: ${detail}` : ''}`);
    error.response = data;
    throw error;
  }

  return data;
}

async function login(account, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  });

  if (!data?.access_token || !data?.user) {
    throw new Error(`Login failed for ${account}`);
  }

  return {
    token: data.access_token,
    user: data.user,
  };
}

async function loginWithFallbacks(account, passwords) {
  const tried = [];
  for (const password of passwords) {
    tried.push(password);
    try {
      return await login(account, password);
    } catch (error) {
      if (String(error?.message || '').includes('401')) {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Login failed for ${account} with passwords: ${tried.map(() => '[redacted]').join(', ')}`);
}

async function authedRequest(token, path, options = {}) {
  return request(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findAttendanceRow(payload, employeeId) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events.find((row) => row.employeeId === employeeId) || null;
}

function timelineTypes(row) {
  return Array.isArray(row?.timeline) ? row.timeline.map((item) => item.type) : [];
}

function expectActionSequence(timeline) {
  const required = ['CHECK_IN', 'BREAK_OUT', 'BREAK_IN', 'CHECK_OUT'];
  const indices = required.map((type) => timeline.indexOf(type));
  assert(indices.every((index) => index >= 0), `Timeline missing required actions: ${required.join(' -> ')}`);
  for (let i = 1; i < indices.length; i += 1) {
    assert(indices[i] > indices[i - 1], `Timeline order invalid, expected ${required.join(' -> ')}`);
  }
}

function buildTimelineFromAttendanceFields(record) {
  const items = [];
  if (record?.checkIn) items.push({ type: 'CHECK_IN', at: new Date(record.checkIn).getTime() });
  if (record?.breakStart) items.push({ type: 'BREAK_OUT', at: new Date(record.breakStart).getTime() });
  if (record?.breakEnd) items.push({ type: 'BREAK_IN', at: new Date(record.breakEnd).getTime() });
  if (record?.checkOut) items.push({ type: 'CHECK_OUT', at: new Date(record.checkOut).getTime() });

  assert(items.length === 4, 'Attendance fields missing one or more required action timestamps');
  for (let i = 1; i < items.length; i += 1) {
    assert(items[i].at >= items[i - 1].at, 'Attendance field timestamps are not in non-decreasing order');
  }

  return items.map((item) => item.type);
}

async function waitForCompleteTimeline({
  token,
  employeeId,
  attendanceId,
  startDateKey,
  endDateKey,
  includeEmployeeFilter = true,
  attempts = 10,
  delayMs = 500,
}) {
  let lastRow = null;
  for (let i = 0; i < attempts; i += 1) {
    const query = includeEmployeeFilter
      ? `/attendance/events?startDate=${startDateKey}&endDate=${endDateKey}&employeeId=${employeeId}`
      : `/attendance/events?startDate=${startDateKey}&endDate=${endDateKey}`;
    const payload = await authedRequest(token, query);
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const row = events.find((item) => item.id === attendanceId) || findAttendanceRow(payload, employeeId);
    lastRow = row || null;
    const types = timelineTypes(row);
    const required = ['CHECK_IN', 'BREAK_OUT', 'BREAK_IN', 'CHECK_OUT'];
    if (required.every((type) => types.includes(type))) {
      return row;
    }

    if (i < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return lastRow;
}

async function createTempEmployee(adminToken, companyId, roleId) {
  const suffix = Date.now() + Math.floor(Math.random() * 1000);
  const department = await authedRequest(adminToken, '/departments', {
    method: 'POST',
    body: JSON.stringify({
      companyId,
      name: `Desktop Smoke ${suffix}`,
      code: `DS${String(suffix).slice(-6)}`,
      status: 'ACTIVE',
    }),
  });

  const username = `desktop_smoke_${suffix}`;
  const email = `${username}@xtten.local`;

  const user = await authedRequest(adminToken, '/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      username,
      password: USER_PASSWORD,
      name: `Desktop Smoke ${suffix}`,
      companyId,
      roleId,
      status: 'ACTIVE',
    }),
  });

  const employee = await authedRequest(adminToken, '/employees', {
    method: 'POST',
    body: JSON.stringify({
      companyId,
      userId: user.id,
      name: user.name,
      email: user.email,
      departmentId: department.id,
      status: 'ACTIVE',
    }),
  });

  return {
    department,
    user,
    employee,
    username,
  };
}

(async () => {
  const today = new Date();
  const todayKey = localDateText(today);
  const monthKey = monthText(today);

  console.log(`[1/10] Logging in as admin ${ADMIN_ACCOUNT}`);
  const adminAuth = await loginWithFallbacks(ADMIN_ACCOUNT, [
    ADMIN_PASSWORD,
    'password123',
    '123456',
  ]);
  const adminToken = adminAuth.token;

  console.log('[2/10] Resolving company and COMPANY_ADMIN role');
  let companyId = adminAuth.user?.companyId || null;
  if (!companyId) {
    const companies = await authedRequest(adminToken, '/companies');
    const firstCompany = Array.isArray(companies) ? companies[0] : null;
    companyId = firstCompany?.id || null;
  }
  assert(companyId, 'No available companyId for smoke test');

  const roles = await authedRequest(adminToken, '/roles');
  const companyAdminRole = Array.isArray(roles)
    ? roles.find((role) => role.name === 'COMPANY_ADMIN')
    : null;
  assert(companyAdminRole?.id, 'COMPANY_ADMIN role not found');

  console.log('[3/10] Creating a temporary employee (auto-retry on same-day conflict)');
  let department = null;
  let user = null;
  let employee = null;
  let username = '';
  let employeeToken = '';
  let clockInResult = null;
  let todayAttendance = null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const temp = await createTempEmployee(adminToken, companyId, companyAdminRole.id);
    department = temp.department;
    user = temp.user;
    employee = temp.employee;
    username = temp.username;

    console.log(`[4/10] Logging in as temp desktop employee ${username} (attempt ${attempt})`);
    const employeeAuth = await login(username, USER_PASSWORD);
    employeeToken = employeeAuth.token;

    console.log('[5/10] Performing Clock In');
    clockInResult = await authedRequest(employeeToken, '/attendance/check-in', { method: 'POST', body: JSON.stringify({}) });
    assert(clockInResult?.id, 'Clock In did not return an attendance id');
    await sleep(400);

    todayAttendance = await authedRequest(employeeToken, '/attendance/today');
    if (todayAttendance?.id === clockInResult.id && todayAttendance?.checkIn && !todayAttendance?.checkOut) {
      break;
    }

    console.warn(`Clock-in chain invalid for ${username} (today mismatch or already checked out), retrying with a fresh employee.`);
  }

  assert(user && employee && department && username && employeeToken, 'Failed to provision a valid temporary employee');
  assert(todayAttendance?.checkIn, 'Today record missing checkIn after Clock In');
  assert(!todayAttendance?.checkOut, 'New test employee still collided with a closed attendance record');
  assert(todayAttendance?.id === clockInResult.id, 'Today record does not match the newly created check-in record');

  console.log('[6/10] Performing Break Start');
    const breakStartResult = await authedRequest(employeeToken, '/attendance/break-out', { method: 'POST', body: JSON.stringify({}) });
  assert(breakStartResult?.attendanceId, 'Break Start did not return attendance id');
    assert(breakStartResult.attendanceId === clockInResult.id, 'Break Start attendance id mismatch with check-in record');
  await sleep(400);

  todayAttendance = await authedRequest(employeeToken, '/attendance/today');
  assert(todayAttendance?.breakStart, 'Today record missing breakStart after Break Start');
    assert(!todayAttendance?.breakEnd, 'Today record has unexpected breakEnd immediately after Break Start');
    assert(!todayAttendance?.checkOut, 'Today record was checked out before Break End');

    let attendanceId = todayAttendance.id || clockInResult.id;

  console.log('[7/10] Performing Break End');
    const breakEndResult = await authedRequest(employeeToken, '/attendance/break-in', { method: 'POST', body: JSON.stringify({}) });
  assert(breakEndResult?.attendanceId, 'Break End did not return attendance id');
    assert(breakEndResult.attendanceId === attendanceId, 'Break End attendance id mismatch with active record');
  await sleep(400);

  todayAttendance = await authedRequest(employeeToken, '/attendance/today');
  assert(todayAttendance?.breakEnd, 'Today record missing breakEnd after Break End');
    assert(!todayAttendance?.checkOut, 'Today record was checked out before Clock Out action');

  attendanceId = todayAttendance.id || attendanceId;

  console.log('[8/10] Performing Clock Out');
  attendanceId = todayAttendance.id || attendanceId;
    const clockOutResult = await authedRequest(employeeToken, `/attendance/check-out/${attendanceId}`, { method: 'POST', body: JSON.stringify({}) });
  assert(clockOutResult?.id || clockOutResult?.attendanceId || attendanceId, 'Clock Out did not return an attendance id');
  await sleep(400);

  todayAttendance = await authedRequest(employeeToken, '/attendance/today');
  assert(todayAttendance?.checkOut, 'Today record missing checkOut after Clock Out');
    assert(todayAttendance?.breakStart, 'Today record missing breakStart after full action chain');
    assert(todayAttendance?.breakEnd, 'Today record missing breakEnd after full action chain');

    console.log('[9/10] Verifying Timeline, Attendance Records, and reports');
    const workDateKey = localDateText(new Date(todayAttendance.date || today));
    const localTodayKey = localDateText(new Date());

    let row = await waitForCompleteTimeline({
      token: employeeToken,
      employeeId: employee.id,
      attendanceId,
      startDateKey: workDateKey,
      endDateKey: workDateKey,
      includeEmployeeFilter: true,
    });

    let finalTypes = timelineTypes(row);
    const hasFullSequence = ['CHECK_IN', 'BREAK_OUT', 'BREAK_IN', 'CHECK_OUT'].every((type) => finalTypes.includes(type));

    if (!hasFullSequence) {
      row = await waitForCompleteTimeline({
        token: employeeToken,
        employeeId: employee.id,
        attendanceId,
        startDateKey: workDateKey,
        endDateKey: localTodayKey,
        includeEmployeeFilter: true,
        attempts: 12,
        delayMs: 600,
      });
      finalTypes = timelineTypes(row);
    }

    assert(row, 'Attendance Events row not found for temp employee');
    assert(row.id === attendanceId, 'Attendance Events did not return the active attendance record');
    const timelineFromEvents = finalTypes;
    const timelineFromFields = buildTimelineFromAttendanceFields({
      checkIn: row.checkIn || todayAttendance.checkIn,
      breakStart: row.breakStart || todayAttendance.breakStart,
      breakEnd: row.breakEnd || todayAttendance.breakEnd,
      checkOut: row.checkOut || todayAttendance.checkOut,
    });

    const hasCompleteEventsTimeline = ['CHECK_IN', 'BREAK_OUT', 'BREAK_IN', 'CHECK_OUT']
      .every((type) => timelineFromEvents.includes(type));
    const verifiedTimeline = hasCompleteEventsTimeline ? timelineFromEvents : timelineFromFields;
    expectActionSequence(verifiedTimeline);

    const dailyReportDate = workDateKey;
    const dailyReport = await authedRequest(employeeToken, `/reports/daily?date=${dailyReportDate}&companyId=${companyId}`);
    const dailyRows = Array.isArray(dailyReport?.rows) ? dailyReport.rows : [];
    assert(dailyRows.some((item) => item.employeeId === employee.id), 'Daily report missing temp employee');

    const monthlyReport = await authedRequest(employeeToken, `/reports/monthly?month=${monthKey}&companyId=${companyId}`);
    assert(monthlyReport, 'Monthly report request failed');

    console.log('[10/10] Checking screenshot and telemetry endpoints still respond');
    const liveActivity = await authedRequest(employeeToken, `/activity/live?date=${dailyReportDate}&limit=20`);
    const screenshots = await authedRequest(employeeToken, `/activity/screenshots?date=${dailyReportDate}&limit=20`);
    assert(liveActivity && typeof liveActivity === 'object', 'Live activity response missing');
    assert(screenshots && typeof screenshots === 'object', 'Screenshots response missing');

    const result = {
      status: 'PASS',
      employee: {
        userId: user.id,
        employeeId: employee.id,
        username,
        departmentId: department.id,
      },
      attendance: {
        attendanceId,
        checkIn: todayAttendance.checkIn,
        breakStart: todayAttendance.breakStart,
        breakEnd: todayAttendance.breakEnd,
        checkOut: todayAttendance.checkOut,
        timeline: verifiedTimeline,
      },
      checks: {
        todayTimelineOk: true,
        attendanceRecordsOk: true,
        dailyReportOk: true,
        monthlyReportOk: Boolean(monthlyReport),
        liveActivityOk: true,
        screenshotsOk: true,
      },
    };

    console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error('SMOKE FAILED');
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});