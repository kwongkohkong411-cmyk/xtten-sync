/* eslint-disable no-console */
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const ADMIN_ACCOUNT = process.env.SMOKE_ADMIN_ACCOUNT || 'sn888xt';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || 'password123';

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function fmtMonth(d) {
  return d.toISOString().slice(0, 7);
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
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const error = new Error(`${options.method || 'GET'} ${path} failed: ${res.status}`);
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
  return {
    token: data.access_token,
    user: data.user,
  };
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

(async () => {
  const today = new Date();
  const todayText = fmtDate(today);
  const monthText = fmtMonth(today);

  const adminAuth = await login(ADMIN_ACCOUNT, ADMIN_PASSWORD);
  const adminToken = adminAuth.token;
  const adminUser = adminAuth.user;

  const companies = await authedRequest(adminToken, '/companies');
  const firstCompany = Array.isArray(companies) ? companies[0] : null;
  const companyId = adminUser?.companyId || firstCompany?.id;

  if (!companyId) {
    throw new Error('No available companyId for smoke test');
  }

  // 1) Leave Type: Annual Leave / PAID
  const leaveTypes = await authedRequest(adminToken, `/leave-settings/types?companyId=${companyId}`);
  let annualType = Array.isArray(leaveTypes)
    ? leaveTypes.find((x) => x.name === 'Annual Leave' && x.category === 'PAID')
    : null;

  if (!annualType) {
    annualType = await authedRequest(adminToken, '/leave-settings/types', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        name: 'Annual Leave',
        category: 'PAID',
        active: true,
      }),
    });
  }

  // 2) Balance: Monthly / 2 days
  const balances = await authedRequest(adminToken, `/leave-settings/balances?companyId=${companyId}`);
  let monthlyBalance = Array.isArray(balances)
    ? balances.find((x) => x.leaveTypeId === annualType.id && x.period === 'MONTHLY')
    : null;

  if (!monthlyBalance) {
    monthlyBalance = await authedRequest(adminToken, '/leave-settings/balances', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        leaveTypeId: annualType.id,
        period: 'MONTHLY',
        days: 2,
        active: true,
      }),
    });
  } else if (Number(monthlyBalance.days) !== 2) {
    monthlyBalance = await authedRequest(adminToken, `/leave-settings/balances/${monthlyBalance.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ days: 2, active: true }),
    });
  }

  // 3) Create approver employee
  const suffix = Date.now();
  const approverUsername = `leave_app_${suffix}`;
  const approverEmail = `leave_app_${suffix}@xtten.local`;
  const approverPassword = 'password123';

  const approverUser = await authedRequest(adminToken, '/users', {
    method: 'POST',
    body: JSON.stringify({
      email: approverEmail,
      username: approverUsername,
      password: approverPassword,
      name: `Leave Approver ${suffix}`,
      companyId,
    }),
  });

  const approverEmployee = await authedRequest(adminToken, '/employees', {
    method: 'POST',
    body: JSON.stringify({
      companyId,
      userId: approverUser.id,
      name: approverUser.name,
      email: approverUser.email,
      status: 'ACTIVE',
    }),
  });

  // 4) Add Approver
  const approvers = await authedRequest(adminToken, `/leave-settings/approvers?companyId=${companyId}`);
  let approver = Array.isArray(approvers)
    ? approvers.find((x) => x.employeeId === approverEmployee.id)
    : null;

  if (!approver) {
    approver = await authedRequest(adminToken, '/leave-settings/approvers', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        employeeId: approverEmployee.id,
        active: true,
      }),
    });
  }

  // 5) Create requester employee and submit leave request
  const employeeUsername = `leave_emp_${suffix}`;
  const employeeEmail = `leave_emp_${suffix}@xtten.local`;
  const employeePassword = 'password123';

  const createdUser = await authedRequest(adminToken, '/users', {
    method: 'POST',
    body: JSON.stringify({
      email: employeeEmail,
      username: employeeUsername,
      password: employeePassword,
      name: `Leave Emp ${suffix}`,
      companyId,
    }),
  });

  const createdEmployee = await authedRequest(adminToken, '/employees', {
    method: 'POST',
    body: JSON.stringify({
      companyId,
      userId: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
      status: 'ACTIVE',
    }),
  });

  // Bind requester to built-in EMPLOYEE role. This avoids temporary test roles
  // and validates that default role permissions are sufficient.
  const roles = await authedRequest(adminToken, '/roles');
  const employeeRole = Array.isArray(roles)
    ? roles.find((item) => item.name === 'EMPLOYEE')
    : null;

  if (!employeeRole?.id) {
    throw new Error('EMPLOYEE role not found for smoke requester');
  }

  await authedRequest(adminToken, `/users/${createdUser.id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({
      roleId: employeeRole.id,
    }),
  });

  const employeeAuth = await login(employeeUsername, employeePassword);
  const employeeToken = employeeAuth.token;

  const leaveRequest = await authedRequest(employeeToken, '/leaves', {
    method: 'POST',
    body: JSON.stringify({
      type: 'Annual Leave',
      startDate: todayText,
      endDate: todayText,
      reason: 'Smoke test leave request',
    }),
  });

  // 6) Admin approve
  const approved = await authedRequest(adminToken, `/leaves/${leaveRequest.id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'APPROVED' }),
  });

  // 7) Attendance status should display LEAVE
  const eventsData = await authedRequest(
    adminToken,
    `/attendance/events?startDate=${todayText}&endDate=${todayText}&employeeId=${createdEmployee.id}`,
  );
  const events = Array.isArray(eventsData?.events) ? eventsData.events : [];
  const leaveEvent = events.find((e) => e.employeeId === createdEmployee.id);

  // 8) Daily / Monthly report should count LEAVE
  const daily = await authedRequest(adminToken, `/reports/daily?date=${todayText}&companyId=${companyId}`);
  const monthly = await authedRequest(adminToken, `/reports/monthly?month=${monthText}&companyId=${companyId}`);

  const result = {
    setup: {
      leaveType: { id: annualType.id, name: annualType.name, category: annualType.category },
      balance: {
        id: monthlyBalance.id,
        period: monthlyBalance.period,
        days: Number(monthlyBalance.days),
      },
      approver: {
        id: approver.id,
        employeeId: approver.employeeId,
        active: approver.active,
      },
    },
    flow: {
      employee: {
        userId: createdUser.id,
        employeeId: createdEmployee.id,
        username: employeeUsername,
      },
      approverEmployee: {
        userId: approverUser.id,
        employeeId: approverEmployee.id,
        username: approverUsername,
      },
      leaveRequest: {
        id: leaveRequest.id,
        statusAfterApprove: approved.status,
      },
    },
    verification: {
      attendanceStatus: leaveEvent?.status || null,
      attendanceAnomalyList: leaveEvent?.anomalyList || null,
      dailyLeaveCount: daily?.statusSummary?.leave ?? null,
      monthlyLeaveCount: monthly?.statusTotals?.leave ?? null,
    },
  };

  console.log(JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error('SMOKE_FAILED');
  console.error(err.message || err);
  if (err.response) {
    console.error(JSON.stringify(err.response, null, 2));
  }
  process.exit(1);
});
