/**
 * Diagnostic script to check test user data
 */
const http = require('http');

const API_BASE = 'http://localhost:3000';
const TEST_USER = {
  email: 'validation@test.local',
  password: 'validation123',
};

let token = null;

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

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: data,
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function diagnose() {
  console.log('═'.repeat(80));
  console.log('TEST USER DATA DIAGNOSTIC');
  console.log('═'.repeat(80) + '\n');

  // Login
  console.log('1. Login...');
  let res = await request('POST', '/auth/login', {
    account: TEST_USER.email,
    password: TEST_USER.password,
  });
  if (res.status !== 200 && res.status !== 201) {
    console.log(`   ❌ Failed: ${res.status}`);
    return;
  }
  token = res.body?.access_token;
  console.log(`   ✅ Token: ${token?.substring(0, 20)}...`);
  console.log(`   ✅ User ID: ${res.body?.user?.id?.substring(0, 8)}`);

  // Get employee info
  console.log('\n2. Employee Info (/employees/me)...');
  res = await request('GET', '/employees/me');
  if (res.status === 200) {
    const emp = res.body;
    console.log(`   ✅ Status: ${res.status}`);
    console.log(`   ✅ Name: ${emp.name}`);
    console.log(`   ✅ Email: ${emp.email}`);
    console.log(`   ✅ Team (workGroupId): ${emp.workGroupId || 'NONE'}`);
    console.log(`   ✅ Team Name: ${emp.workGroupName || 'N/A'}`);
  } else {
    console.log(`   ❌ Status: ${res.status} - No employee record`);
  }

  // Get today's schedule
  console.log('\n3. Today\'s Schedule (/attendance/today)...');
  res = await request('GET', '/attendance/today');
  if (res.status === 200) {
    console.log(`   ✅ Status: ${res.status}`);
    const today = res.body;
    if (today?.schedule) {
      console.log(`   ✅ Schedule: ${today.schedule.startTime || today.schedule.scheduledStartTime} - ${today.schedule.endTime || today.schedule.scheduledEndTime}`);
      console.log(`   ✅ Shift: ${today.schedule.shiftName || today.schedule.name}`);
    } else {
      console.log(`   ⚠️  No schedule for today`);
    }
    if (today?.attendance) {
      console.log(`   ✅ Attendance: ${today.attendance.status} (checked in: ${today.attendance.checkInTime})`);
    } else {
      console.log(`   ⚠️  Not checked in yet`);
    }
  } else {
    console.log(`   ❌ Status: ${res.status}`);
  }

  // Get attendance events
  console.log('\n4. Attendance Events (/attendance/events)...');
  res = await request('GET', '/attendance/events?limit=3');
  if (res.status === 200) {
    console.log(`   ✅ Status: ${res.status}`);
    const events = res.body;
    if (Array.isArray(events)) {
      console.log(`   ✅ Event count: ${events.length}`);
      if (events.length > 0) {
        const e = events[0];
        console.log(`   - First event: ${e.date || e.createdAt}`);
        console.log(`   - Has lateMinutes: ${('lateMinutes' in e)}`);
        console.log(`   - Has earlyLeaveMinutes: ${('earlyLeaveMinutes' in e)}`);
      }
    } else {
      console.log(`   ⚠️  Response is not array: ${typeof events}`);
      console.log(`   Response keys: ${Object.keys(events).join(', ')}`);
    }
  } else {
    console.log(`   ❌ Status: ${res.status}`);
  }

  // Get rosters
  console.log('\n5. Rosters (GET /rosters)...');
  const month = new Date().toISOString().slice(0, 7);
  res = await request('GET', `/rosters?month=${month}&limit=3`);
  if (res.status === 200) {
    console.log(`   ✅ Status: ${res.status}`);
    const rosters = res.body;
    if (Array.isArray(rosters)) {
      console.log(`   ✅ Roster count: ${rosters.length}`);
      if (rosters.length > 0) {
        const r = rosters[0];
        console.log(`   - First roster: shift=${r.shift?.name || r.shiftId}, team=${r.workGroupName || r.workGroupId}, emp=${r.employeeName || r.employeeId}`);
      }
    } else {
      console.log(`   ⚠️  Response is not array`);
    }
  } else {
    console.log(`   ❌ Status: ${res.status}`);
  }

  console.log('\n' + '═'.repeat(80));
}

diagnose().catch(console.error);
