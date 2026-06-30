const elements = {
  loginScreen: document.getElementById('loginScreen'),
  workspaceScreen: document.getElementById('workspaceScreen'),
  loginForm: document.getElementById('loginForm'),
  loginStatusBadge: document.getElementById('loginStatusBadge'),
  loginNotice: document.getElementById('loginNotice'),
  workspaceNotice: document.getElementById('workspaceNotice'),
  apiBaseUrl: document.getElementById('apiBaseUrl'),
  account: document.getElementById('account'),
  password: document.getElementById('password'),
  workspaceTitle: document.getElementById('workspaceTitle'),
  metaEmployee: document.getElementById('metaEmployee'),
  metaCompany: document.getElementById('metaCompany'),
  metaTeam: document.getElementById('metaTeam'),
  metaClock: document.getElementById('metaClock'),
  metaStatusPill: document.getElementById('metaStatusPill'),
  mainNav: document.getElementById('mainNav'),
  dashboardRoot: document.getElementById('dashboardRoot'),
  attendanceRoot: document.getElementById('attendanceRoot'),
  leaveRoot: document.getElementById('leaveRoot'),
  reportsRoot: document.getElementById('reportsRoot'),
  notificationsRoot: document.getElementById('notificationsRoot'),
  settingsRoot: document.getElementById('settingsRoot'),
};

const state = {
  auth: null,
  settings: { language: 'en', autoUpdate: true },
  diagnostics: null,
  activeTab: 'attendance',
  currentPeriod: 'today',
  loading: false,
  data: {
    attendanceToday: null,
    attendanceEvents: [],
    leaves: [],
    reportToday: null,
    reportWeek: null,
    reportMonth: null,
    notifications: [],
    update: null,
  },
};

const TAB_LABELS = {
  attendance: 'Attendance',
  leave: 'Leave',
  reports: 'Work Report',
  settings: 'Settings',
};

const PERIOD_LABELS = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
};

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'en' },
  { label: '中文', value: 'zh-CN' },
];

const LEAVE_TYPES = ['ANNUAL', 'SICK', 'CASUAL', 'EMERGENCY', 'OTHER'];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatShortDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

function formatDurationHours(hours) {
  const numeric = Number(hours || 0);
  return `${numeric.toFixed(2)} hr`;
}

function formatMinutesAsHours(minutes) {
  const numeric = Math.max(0, Math.round(Number(minutes || 0)));
  return `${numeric} min / ${(numeric / 60).toFixed(2)} hr`;
}

function formatCompactTime(minutes) {
  const totalMinutes = Math.max(0, Math.round(Number(minutes || 0)));
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const remainingMinutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}h ${remainingMinutes}m`;
}

function getTeamDisplay(user) {
  const candidates = [
    { label: 'Team Name', value: user?.teamName },
    { label: 'Work Group', value: user?.workGroupName },
    { label: 'Department', value: user?.departmentName },
  ];

  const source = candidates.find((item) => String(item.value || '').trim());

  return {
    value: source?.value || 'Team Unassigned',
    sourceLabel: source?.label || 'Unknown',
  };
}

function getAttendanceBadgeLabel(attendanceState) {
  switch (attendanceState?.tone) {
    case 'green':
      return `🟢 ${attendanceState.label}`;
    case 'amber':
      return `🟠 ${attendanceState.label}`;
    case 'blue':
      return `🔵 ${attendanceState.label}`;
    case 'slate':
      return `🔵 ${attendanceState.label}`;
    default:
      return `⚪ ${attendanceState?.label || 'Not Clocked In'}`;
  }
}

function statusPillClass(tone) {
  return `status-pill ${tone || 'neutral'}`;
}

function getTodayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function getWeekStart(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function minuteDiff(start, end) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, Math.floor((endTime - startTime) / 60000));
}

function getAttendanceState(today) {
  if (!today || !today.checkIn) {
    return {
      label: 'Not Clocked In',
      tone: 'blue',
      canClockIn: true,
      canBreakStart: false,
      canBreakEnd: false,
      canClockOut: false,
    };
  }

  if (today.checkOut) {
    return {
      label: 'Finished',
      tone: 'slate',
      canClockIn: false,
      canBreakStart: false,
      canBreakEnd: false,
      canClockOut: false,
    };
  }

  if (today.breakStart && !today.breakEnd) {
    return {
      label: 'Break',
      tone: 'amber',
      canClockIn: false,
      canBreakStart: false,
      canBreakEnd: true,
      canClockOut: true,
    };
  }

  return {
    label: 'Working',
    tone: 'green',
    canClockIn: false,
    canBreakStart: true,
    canBreakEnd: false,
    canClockOut: true,
  };
}

function getCurrentWorkMinutes(today) {
  if (!today?.checkIn) return 0;

  const clockOut = today.checkOut ? new Date(today.checkOut) : new Date();
  const checkIn = new Date(today.checkIn);
  let minutes = Math.max(0, minuteDiff(checkIn, clockOut));

  if (today.breakStart) {
    const breakEnd = today.breakEnd ? new Date(today.breakEnd) : (today.checkOut ? new Date(today.checkOut) : new Date());
    minutes -= Math.max(0, minuteDiff(today.breakStart, breakEnd));
  }

  return Math.max(0, minutes);
}

function getBreakMinutes(today) {
  if (!today?.breakStart) return 0;
  const breakEnd = today.breakEnd ? new Date(today.breakEnd) : (today.checkOut ? new Date(today.checkOut) : new Date());
  return Math.max(0, minuteDiff(today.breakStart, breakEnd));
}

function getOvertimeHours(today) {
  return Math.max(0, getCurrentWorkMinutes(today) / 60 - 8);
}

function renderLiveWorkMetrics() {
  const today = state.data.attendanceToday;
  const statusChipEl = document.getElementById('attendanceHomeStatus');
  if (statusChipEl) {
    const attendanceState = getAttendanceState(today);
    statusChipEl.className = `status-pill ${attendanceState.tone}`;
    statusChipEl.textContent = attendanceState.label;
  }
}

function renderAttendanceHome() {
  try {
    const today = state.data.attendanceToday;
    const attendanceState = getAttendanceState(today);
    const timeline = getAttendanceTimeline(state.data.attendanceEvents, today);
    const workMinutes = getCurrentWorkMinutes(today);
    const overtimeHours = getOvertimeHours(today);
    const username = state.auth?.user?.username || state.auth?.user?.name || '-';
    const primaryAction = !today?.checkIn
      ? { label: 'Clock In', action: 'clock-in' }
      : today?.checkOut
        ? { label: 'Day Completed', action: null, disabled: true }
        : today?.breakStart && !today?.breakEnd
          ? { label: 'Break End', action: 'break-end' }
          : { label: 'Break Start', action: 'break-start' };
    const dateLine = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
    const badgeLabel = getAttendanceBadgeLabel(attendanceState);

    elements.attendanceRoot.innerHTML = `
      <div class="attendance-home">
        <div class="hero-grid">
          <article class="hero-panel card-surface">
            <div class="section-head compact">
              <div>
                <p class="eyebrow">Attendance</p>
                <h2>Good Morning, ${escapeHtml(username)} 👋</h2>
                <div class="hero-subtitle">${escapeHtml(username)}</div>
                <div class="hero-date-line">${escapeHtml(dateLine)}</div>
              </div>
              <div class="status-stack">
                <div class="status-summary">
                  <span>Today's Status</span>
                  <strong id="attendanceHomeStatus" class="${statusPillClass(attendanceState.tone)}">${escapeHtml(badgeLabel)}</strong>
                </div>
                <div class="hero-datetime">${escapeHtml(formatDateTime(new Date()))}</div>
              </div>
            </div>

            <div class="hero-action">
              ${primaryAction.disabled
                ? `<button class="primary-action hero-button" type="button" disabled>${escapeHtml(primaryAction.label)}</button>`
                : `<button class="primary-action hero-button" data-attendance-action="${primaryAction.action}" type="button">${escapeHtml(primaryAction.label)}</button>`}
            </div>

            <div class="hero-grid-mini">
              <div class="mini-card">
                <span>Today's Work Time</span>
                <strong>${escapeHtml(formatCompactTime(workMinutes))}</strong>
              </div>
              <div class="mini-card">
                <span>Overtime</span>
                <strong>${escapeHtml(formatCompactTime(Math.max(0, overtimeHours * 60)))}</strong>
              </div>
            </div>
          </article>

          <article class="timeline-panel card-surface">
            <div class="section-head compact">
              <div>
                <p class="eyebrow">Timeline</p>
                <h2>Today's Timeline</h2>
              </div>
            </div>
            <div class="timeline compact-timeline">
              ${timeline.length ? timeline.map((entry) => `
                <div class="timeline-item">
                  <strong>${escapeHtml(formatTime(entry.at))}</strong>
                  <div>
                    <div>${escapeHtml(formatTimelineType(entry.type))}</div>
                    <div class="muted">${escapeHtml(entry.source || entry.type || '')}</div>
                  </div>
                </div>
              `).join('') : '<div class="muted">No timeline yet for today.</div>'}
            </div>
          </article>
        </div>

        <div class="action-grid">
          <button class="secondary-action action-tile" data-tab="leave" type="button">
            <span>Apply Leave</span>
          </button>
          <button class="secondary-action action-tile" data-tab="reports" type="button">
            <span>Work Report</span>
          </button>
        </div>
      </div>
    `;
  } catch (error) {
    elements.attendanceRoot.innerHTML = `
      <div class="render-error card-surface">
        <p class="eyebrow">Attendance</p>
        <h2>Unable to render attendance</h2>
        <p class="muted">${escapeHtml(error?.message || 'Unexpected render failure.')}</p>
      </div>
    `;
    throw error;
  }
}

function getAttendanceTimeline(events, today) {
  const rows = Array.isArray(events) ? [...events] : [];
  if (rows.length) {
    const timeline = rows[0]?.timeline;
    if (Array.isArray(timeline) && timeline.length) {
      return timeline.map((item) => ({
        type: item.type,
        at: item.at,
        source: item.source,
      }));
    }
  }

  const fallback = [];
  if (today?.checkIn) fallback.push({ type: 'CHECK_IN', at: today.checkIn });
  if (today?.breakStart) fallback.push({ type: 'BREAK_OUT', at: today.breakStart });
  if (today?.breakEnd) fallback.push({ type: 'BREAK_IN', at: today.breakEnd });
  if (today?.checkOut) fallback.push({ type: 'CHECK_OUT', at: today.checkOut });
  return fallback;
}

function formatTimelineType(type) {
  switch (type) {
    case 'CHECK_IN': return 'Clock In';
    case 'BREAK_OUT': return 'Break Start';
    case 'BREAK_IN': return 'Break End';
    case 'CHECK_OUT': return 'Clock Out';
    case 'AUTO_CHECK_OUT': return 'Auto Clock Out';
    default: return type || 'Event';
  }
}

function reportRows(reportData) {
  if (!reportData) return [];
  if (Array.isArray(reportData.rows)) return reportData.rows;
  if (Array.isArray(reportData.trend)) return reportData.trend;
  return [];
}

function aggregateDaily(reportData) {
  const rows = Array.isArray(reportData?.rows) ? reportData.rows : [];
  const summary = reportData?.statusSummary || {};
  return {
    present: Number(summary.onTime || 0) + Number(summary.late || 0),
    late: Number(summary.late || 0),
    leave: Number(summary.leave || 0),
    absent: Number(summary.absent || 0) + Number(summary.missing || 0),
    workHours: rows.reduce((sum, row) => sum + Number(row?.totalHoursDecimal || 0), 0),
    overtime: rows.reduce((sum, row) => sum + Number(row?.otHoursDecimal || 0), 0),
  };
}

function aggregateMonthly(reportData) {
  const status = reportData?.statusTotals || {};
  return {
    totalEmployees: Number(reportData?.totalEmployees || 0),
    attendanceRate: Number(reportData?.averageAttendanceRate || 0),
    onTime: Number(status.onTime || 0),
    late: Number(status.late || 0),
    leave: Number(status.leave || 0),
    absent: Number(status.absent || 0) + Number(status.missing || 0),
  };
}

function aggregateSummary(reportData) {
  const rows = Array.isArray(reportData?.rows) ? reportData.rows : [];
  const totals = rows.reduce((acc, row) => {
    acc.totalDays += Number(row?.totalDays || 0);
    acc.onTime += Number(row?.onTime || 0);
    acc.late += Number(row?.late || 0);
    acc.leave += Number(row?.leave || 0);
    acc.absent += Number(row?.absent || 0);
    acc.missing += Number(row?.missing || 0);
    return acc;
  }, { totalDays: 0, onTime: 0, late: 0, leave: 0, absent: 0, missing: 0 });

  const present = totals.onTime + totals.late;
  return {
    totalEmployees: rows.length,
    attendanceRate: totals.totalDays ? Number(((present / totals.totalDays) * 100).toFixed(2)) : 0,
    onTime: totals.onTime,
    late: totals.late,
    leave: totals.leave,
    absent: totals.absent + totals.missing,
  };
}

function setNotice(message, tone = 'info', target = 'workspace') {
  const el = target === 'login' ? elements.loginNotice : elements.workspaceNotice;
  if (!el) return;

  if (!message) {
    el.textContent = '';
    el.className = target === 'login' ? 'notice' : 'workspace-notice card-surface hidden';
    return;
  }

  el.textContent = message;
  if (target === 'login') {
    el.style.color = tone === 'error' ? '#b42318' : '#0f5132';
  } else {
    el.className = `workspace-notice card-surface ${tone}`;
    el.classList.remove('hidden');
  }
}

function setActiveTab(tab) {
  state.activeTab = tab;
  elements.workspaceTitle.textContent = TAB_LABELS[tab] || 'Attendance';

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-tab') === tab);
  });

  document.querySelectorAll('[data-view]').forEach((pane) => {
    pane.classList.toggle('active', pane.getAttribute('data-view') === tab);
  });
}

async function apiRequest(path, options = {}) {
  const response = await window.agentBridge.apiRequest({ path, ...options });
  return response?.data ?? null;
}

async function refreshState() {
  const current = await window.agentBridge.getState();
  state.auth = current.auth || null;
  state.settings = current.settings || state.settings;
  state.diagnostics = current.diagnostics || null;

  const loggedIn = Boolean(state.auth?.user);
  elements.loginScreen.classList.toggle('hidden', loggedIn);
  elements.workspaceScreen.classList.toggle('hidden', !loggedIn);

  elements.loginStatusBadge.textContent = loggedIn ? 'Online' : 'Offline';
  elements.loginStatusBadge.className = loggedIn ? 'status-pill green' : 'status-pill neutral';

  elements.apiBaseUrl.value = state.auth?.apiBaseUrl || current.defaultApiBaseUrl || 'http://localhost:3000';
  elements.apiBaseUrl.readOnly = Boolean(current.apiLocked);

  const teamDisplay = getTeamDisplay(state.auth?.user);
  elements.metaEmployee.textContent = loggedIn ? (state.auth.user?.username || state.auth.user?.name || '-') : '-';
  elements.metaCompany.textContent = loggedIn ? (state.auth.user?.company?.name || 'No Company Selected') : '-';
  elements.metaTeam.textContent = loggedIn ? teamDisplay.value : '-';

  elements.metaStatusPill.textContent = loggedIn ? getAttendanceBadgeLabel(getAttendanceState(state.data.attendanceToday)) : '⚪ Not Clocked In';
  elements.metaStatusPill.className = loggedIn ? statusPillClass(getAttendanceState(state.data.attendanceToday).tone) : 'status-pill neutral';

  if (!loggedIn) {
    if (elements.dashboardRoot) elements.dashboardRoot.innerHTML = '';
    if (elements.attendanceRoot) elements.attendanceRoot.innerHTML = '';
    if (elements.leaveRoot) elements.leaveRoot.innerHTML = '';
    if (elements.reportsRoot) elements.reportsRoot.innerHTML = '';
    if (elements.notificationsRoot) elements.notificationsRoot.innerHTML = '';
    if (elements.settingsRoot) elements.settingsRoot.innerHTML = '';
    return;
  }

  await loadWorkspaceData();
  renderAll();
  setActiveTab(state.activeTab);
}

async function loadWorkspaceData() {
  state.loading = true;
  try {
    const todayKey = getTodayKey();
    const weekStart = getWeekStart();
    const monthKey = getMonthKey();

    const requests = await Promise.allSettled([
      apiRequest('/attendance/today'),
      apiRequest('/attendance/events', { query: { startDate: todayKey, endDate: todayKey } }),
      apiRequest('/leaves'),
      apiRequest('/reports/daily', { query: { date: todayKey } }),
      apiRequest('/reports/summary', { query: { startDate: weekStart, endDate: todayKey } }),
      apiRequest('/reports/monthly', { query: { month: monthKey } }),
    ]);

    state.data.attendanceToday = requests[0].status === 'fulfilled' ? requests[0].value : null;
    state.data.attendanceEvents = requests[1].status === 'fulfilled'
      ? (requests[1].value?.events || [])
      : [];
    state.data.leaves = requests[2].status === 'fulfilled'
      ? (requests[2].value || [])
      : [];
    state.data.reportToday = requests[3].status === 'fulfilled' ? requests[3].value : null;
    state.data.reportWeek = requests[4].status === 'fulfilled' ? requests[4].value : null;
    state.data.reportMonth = requests[5].status === 'fulfilled' ? requests[5].value : null;
    state.data.notifications = buildNotifications();
    state.data.update = state.diagnostics?.update || null;
  } finally {
    state.loading = false;
  }
}

function buildNotifications() {
  const items = [];
  const leaves = Array.isArray(state.data.leaves) ? state.data.leaves : [];
  for (const leave of leaves.slice(0, 5)) {
    items.push({
      type: 'Leave',
      title: `Leave ${leave.status || 'PENDING'}`,
      description: `${formatShortDate(leave.startDate)} - ${formatShortDate(leave.endDate)} · ${leave.type || 'Other'}`,
      tone: leave.status === 'APPROVED' ? 'green' : leave.status === 'REJECTED' ? 'red' : 'amber',
    });
  }

  if (state.diagnostics?.update?.latestVersion && state.diagnostics?.update?.latestVersion !== state.diagnostics?.update?.currentVersion) {
    items.unshift({
      type: 'Update',
      title: `Update Available ${state.diagnostics.update.latestVersion}`,
      description: 'A new desktop build is ready to install.',
      tone: 'blue',
    });
  }

  items.push({
    type: 'Announcement',
    title: 'Company Announcement',
    description: 'Use the desktop app for attendance, leave, and work reporting.',
    tone: 'slate',
  });

  return items;
}

function renderDashboard() {
  if (elements.dashboardRoot) {
    elements.dashboardRoot.innerHTML = '';
  }
}

function renderAttendance() {
  try {
    renderAttendanceHome();
  } catch (error) {
    setNotice(error?.message || 'Failed to render attendance view.', 'error');
  }
}

function renderLeave() {
  const leaves = Array.isArray(state.data.leaves) ? state.data.leaves : [];
  elements.leaveRoot.innerHTML = `
    <div class="panel-grid cols-2">
      <article class="form-card">
        <h3>Apply Leave</h3>
        <form id="leaveForm" class="stack">
          <div class="panel-grid cols-2">
            <label>
              Start Date
              <input name="startDate" type="date" required />
            </label>
            <label>
              End Date
              <input name="endDate" type="date" required />
            </label>
          </div>
          <label>
            Type
            <select name="type" required>
              ${LEAVE_TYPES.map((item) => `<option value="${item}">${item}</option>`).join('')}
            </select>
          </label>
          <label>
            Reason
            <textarea name="reason" placeholder="Describe the leave request" required></textarea>
          </label>
          <button class="primary-action" type="submit">Submit Leave Request</button>
        </form>
      </article>

      <article class="list-card">
        <h3>Request Status</h3>
        <div class="notification-list">
          ${leaves.length ? leaves.slice(0, 8).map((leave) => `
            <div class="notification-item">
              <div class="notification-head">
                <strong>${escapeHtml(leave.type || 'Leave')}</strong>
                <span class="status-pill ${leave.status === 'APPROVED' ? 'green' : leave.status === 'REJECTED' ? 'red' : 'amber'}">${escapeHtml(leave.status || 'PENDING')}</span>
              </div>
              <div class="muted">${escapeHtml(formatShortDate(leave.startDate))} - ${escapeHtml(formatShortDate(leave.endDate))}</div>
              <div>${escapeHtml(leave.reason || '-')}</div>
            </div>
          `).join('') : '<div class="muted">No leave requests yet.</div>'}
        </div>
      </article>
    </div>
  `;

  const form = document.getElementById('leaveForm');
  if (form) {
    form.addEventListener('submit', handleLeaveSubmit);
  }
}

function renderReports() {
  const todayReport = state.data.reportToday || {};
  const weekReport = state.data.reportWeek || {};
  const monthReport = state.data.reportMonth || {};
  const active = state.currentPeriod;
  const rows = active === 'today'
    ? reportRows(todayReport)
    : active === 'week'
      ? reportRows(weekReport)
      : reportRows(monthReport);

  const periodStats = active === 'today'
    ? (() => {
      const dailyMetrics = aggregateDaily(todayReport);
      return [
        { label: 'Present', value: dailyMetrics.present },
        { label: 'Late', value: dailyMetrics.late },
        { label: 'Leave', value: dailyMetrics.leave },
        { label: 'Absent', value: dailyMetrics.absent },
        { label: 'Work Hours', value: dailyMetrics.workHours.toFixed(2) },
        { label: 'Overtime', value: dailyMetrics.overtime.toFixed(2) },
      ];
    })()
    : active === 'week'
      ? (() => {
        const weeklySummary = aggregateSummary(weekReport);
        return [
          { label: 'Employees', value: weeklySummary.totalEmployees },
          { label: 'Attendance Rate', value: `${weeklySummary.attendanceRate}%` },
          { label: 'On Time', value: weeklySummary.onTime },
          { label: 'Late', value: weeklySummary.late },
          { label: 'Leave', value: weeklySummary.leave },
          { label: 'Absent', value: weeklySummary.absent },
        ];
      })()
      : (() => {
        const monthlyMetrics = aggregateMonthly(monthReport);
        return [
          { label: 'Employees', value: monthlyMetrics.totalEmployees },
          { label: 'Attendance Rate', value: `${monthlyMetrics.attendanceRate}%` },
          { label: 'On Time', value: monthlyMetrics.onTime },
          { label: 'Late', value: monthlyMetrics.late },
          { label: 'Leave', value: monthlyMetrics.leave },
          { label: 'Absent', value: monthlyMetrics.absent },
        ];
      })();

  elements.reportsRoot.innerHTML = `
    <article class="list-card">
      <div class="section-head compact">
        <div>
          <p class="eyebrow">Work Report</p>
          <h2>Today, This Week, This Month</h2>
        </div>
        <div class="period-tabs">
          ${Object.entries(PERIOD_LABELS).map(([key, label]) => `<button type="button" class="period-button ${active === key ? 'active' : ''}" data-period="${key}">${label}</button>`).join('')}
        </div>
      </div>

      <div class="panel-grid cols-3">
        ${periodStats.map((item) => `
          <div class="info-card" style="box-shadow:none; background:rgba(255,255,255,0.7)">
            <div class="metric-label">${escapeHtml(item.label)}</div>
            <div class="metric-number">${escapeHtml(item.value)}</div>
          </div>
        `).join('')}
      </div>
    </article>

    <article class="list-card" style="margin-top:16px;">
      <h3>${escapeHtml(PERIOD_LABELS[active])} Summary</h3>
      <div class="table-list">
        <div class="table-row">
          <header>Team</header>
          <header>Employee</header>
          <header>Status</header>
          <header>Work Hours</header>
          <header>OT</header>
        </div>
        ${rows.length ? rows.slice(0, 10).map((row) => `
          <div class="table-row">
            <div>${escapeHtml(row.teamName || row.team || '-')}</div>
            <div>${escapeHtml(row.name || row.employeeName || row.username || row.employeeId || '-')}</div>
            <div><span class="status-pill ${String(row.status || '').toUpperCase() === 'LATE' ? 'amber' : String(row.status || '').toUpperCase() === 'ABSENT' ? 'red' : 'green'}">${escapeHtml(row.status || row.attendanceRate || '-')}</span></div>
            <div>${escapeHtml(row.totalHoursDecimal != null ? Number(row.totalHoursDecimal).toFixed(2) : row.workHours != null ? Number(row.workHours).toFixed(2) : row.totalHours || '-')}</div>
            <div>${escapeHtml(row.otHoursDecimal != null ? Number(row.otHoursDecimal).toFixed(2) : row.otHours != null ? Number(row.otHours).toFixed(2) : '0.00')}</div>
          </div>
        `).join('') : '<div class="muted">No report rows available.</div>'}
      </div>
    </article>
  `;
}

function renderNotifications() {
  if (elements.notificationsRoot) {
    elements.notificationsRoot.innerHTML = '';
  }
}

function renderSettings() {
  const autoStart = Boolean(state.diagnostics?.autoStart);
  const autoUpdate = state.settings?.autoUpdate !== false;
  const language = state.settings?.language || 'en';

  elements.settingsRoot.innerHTML = `
    <div class="settings-grid simple-settings">
      <article class="form-card">
        <h3>Preferences</h3>
        <div class="settings-stack">
          <label>
            Language
            <select id="languageSelect">
              ${LANGUAGE_OPTIONS.map((item) => `<option value="${item.value}" ${item.value === language ? 'selected' : ''}>${item.label}</option>`).join('')}
            </select>
          </label>

          <div class="switch-row">
            <div class="copy">
              <strong>Auto Start</strong>
              <span>Launch XTTEN Agent on Windows sign-in.</span>
            </div>
            <button id="autoStartToggle" class="toggle ${autoStart ? 'on' : ''}" type="button" aria-pressed="${autoStart}"></button>
          </div>

          <div class="switch-row">
            <div class="copy">
              <strong>Auto Update</strong>
              <span>Check for updates in the background.</span>
            </div>
            <button id="autoUpdateToggle" class="toggle ${autoUpdate ? 'on' : ''}" type="button" aria-pressed="${autoUpdate}"></button>
          </div>

          <div class="form-actions">
            <button id="signOutBtn" class="danger-action" type="button">Sign Out</button>
          </div>
        </div>
      </article>
    </div>
  `;

  const languageSelect = document.getElementById('languageSelect');
  const autoStartToggle = document.getElementById('autoStartToggle');
  const autoUpdateToggle = document.getElementById('autoUpdateToggle');
  const checkUpdateBtn = document.getElementById('checkUpdateBtn');
  const signOutBtn = document.getElementById('signOutBtn');

  languageSelect?.addEventListener('change', async (event) => {
    const value = event.target.value;
    state.settings.language = value;
    await window.agentBridge.setSettings({ language: value });
    setNotice(`Language saved: ${value}`, 'success');
  });

  autoStartToggle?.addEventListener('click', async () => {
    const next = !autoStartToggle.classList.contains('on');
    await window.agentBridge.setAutoStart(next);
    autoStartToggle.classList.toggle('on', next);
    autoStartToggle.setAttribute('aria-pressed', String(next));
    const refreshed = await window.agentBridge.getState();
    state.diagnostics = refreshed.diagnostics || state.diagnostics;
    setNotice(next ? 'Auto Start enabled.' : 'Auto Start disabled.', 'success');
  });

  autoUpdateToggle?.addEventListener('click', async () => {
    const next = !autoUpdateToggle.classList.contains('on');
    state.settings.autoUpdate = next;
    await window.agentBridge.setSettings({ autoUpdate: next });
    autoUpdateToggle.classList.toggle('on', next);
    autoUpdateToggle.setAttribute('aria-pressed', String(next));
    setNotice(next ? 'Auto Update enabled.' : 'Auto Update disabled.', 'success');
  });

  signOutBtn?.addEventListener('click', handleSignOut);
}

async function handleLogin(event) {
  event.preventDefault();
  try {
    const payload = {
      apiBaseUrl: elements.apiBaseUrl.value.trim(),
      account: elements.account.value.trim(),
      password: elements.password.value,
    };

    if (!payload.account || !payload.password) {
      setNotice('Please enter account and password.', 'error', 'login');
      return;
    }

    await window.agentBridge.login(payload);
    elements.password.value = '';
    setNotice('Login successful. Desktop workspace is ready.', 'success', 'login');
    await refreshState();
    setActiveTab('attendance');
  } catch (error) {
    setNotice(error?.message || 'Login failed.', 'error', 'login');
  }
}

async function handleAttendanceAction(action) {
  try {
    state.loading = true;
    if (action === 'clock-in') {
      await apiRequest('/attendance/check-in', { method: 'POST', body: {} });
      setNotice('Clock in completed.', 'success');
    } else if (action === 'break-start') {
      await apiRequest('/attendance/break-out', { method: 'POST', body: {} });
      setNotice('Break started.', 'success');
    } else if (action === 'break-end') {
      await apiRequest('/attendance/break-in', { method: 'POST', body: {} });
      setNotice('Break ended.', 'success');
    } else if (action === 'clock-out') {
      const today = state.data.attendanceToday || await apiRequest('/attendance/today');
      if (!today?.id) throw new Error('No attendance record found for clock out.');
      await apiRequest(`/attendance/check-out/${today.id}`, { method: 'POST', body: {} });
      setNotice('Clock out completed.', 'success');
    }

    await refreshState();
    setActiveTab('attendance');
  } catch (error) {
    setNotice(error?.message || 'Attendance action failed.', 'error');
  } finally {
    state.loading = false;
  }
}

async function handleLeaveSubmit(event) {
  event.preventDefault();
  try {
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      startDate: formData.get('startDate'),
      endDate: formData.get('endDate'),
      type: formData.get('type'),
      reason: formData.get('reason'),
    };

    await apiRequest('/leaves', { method: 'POST', body: payload });
    setNotice('Leave request submitted.', 'success');
    await refreshState();
    setActiveTab('leave');
  } catch (error) {
    setNotice(error?.message || 'Failed to submit leave request.', 'error');
  }
}

async function handleSignOut() {
  try {
    await window.agentBridge.logout();
    state.auth = null;
    state.data = {
      attendanceToday: null,
      attendanceEvents: [],
      leaves: [],
      reportToday: null,
      reportWeek: null,
      reportMonth: null,
      notifications: [],
      update: null,
    };
    setNotice('Signed out.', 'success', 'login');
    await refreshState();
  } catch (error) {
    setNotice(error?.message || 'Sign out failed.', 'error');
  }
}

function bindGlobalEvents() {
  elements.loginForm?.addEventListener('submit', handleLogin);

  elements.mainNav?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    setActiveTab(button.getAttribute('data-tab'));
  });

  elements.mainNav?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="sign-out"]');
    if (!button) return;
    void handleSignOut();
  });

  document.addEventListener('click', (event) => {
    const attendanceButton = event.target.closest('[data-attendance-action]');
    if (attendanceButton) {
      void handleAttendanceAction(attendanceButton.getAttribute('data-attendance-action'));
      return;
    }

    const periodButton = event.target.closest('[data-period]');
    if (periodButton) {
      state.currentPeriod = periodButton.getAttribute('data-period');
      renderReports();
    }
  });
}

function refreshClock() {
  const now = new Date();
  const dateTimeText = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  if (elements.metaClock) {
    elements.metaClock.textContent = dateTimeText;
  }

  const copy = document.getElementById('liveClockCopy');
  if (copy) {
    copy.textContent = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);
  }

  renderLiveWorkMetrics();
}

function renderStateChrome() {
  if (!state.auth?.user) {
    return;
  }

  const attendanceState = getAttendanceState(state.data.attendanceToday);
  elements.metaStatusPill.textContent = getAttendanceBadgeLabel(attendanceState);
  elements.metaStatusPill.className = statusPillClass(attendanceState.tone);
}

function renderAll() {
  try {
    renderDashboard();
    renderAttendance();
    renderLeave();
    renderReports();
    renderSettings();
    renderStateChrome();
  } catch (error) {
    setNotice(error?.message || 'Failed to render desktop workspace.', 'error');
    if (elements.attendanceRoot) {
      elements.attendanceRoot.innerHTML = `
        <div class="render-error card-surface">
          <p class="eyebrow">Workspace error</p>
          <h2>Desktop UI failed to render</h2>
          <p class="muted">${escapeHtml(error?.message || 'Unexpected workspace render failure.')}</p>
        </div>
      `;
    }
  }
}

async function boot() {
  bindGlobalEvents();
  refreshClock();
  setInterval(refreshClock, 1000);
  await refreshState();
  if (state.auth?.user) {
    setActiveTab('attendance');
  }
}

boot().catch((error) => {
  setNotice(error?.message || 'Failed to initialize desktop app.', 'error', 'login');
});