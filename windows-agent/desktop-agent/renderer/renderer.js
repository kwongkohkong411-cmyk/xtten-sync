const stateEls = {
  loginPanel: document.getElementById('loginPanel'),
  loggedInBanner: document.getElementById('loggedInBanner'),
  apiBaseUrl: document.getElementById('apiBaseUrl'),
  account: document.getElementById('account'),
  password: document.getElementById('password'),
  autoStart: document.getElementById('autoStart'),
  statusText: document.getElementById('statusText'),
  diagText: document.getElementById('diagText'),
  updateText: document.getElementById('updateText'),
  notice: document.getElementById('notice'),
  loginBtn: document.getElementById('loginBtn'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  checkUpdateBtn: document.getElementById('checkUpdateBtn'),
  applyUpdateBtn: document.getElementById('applyUpdateBtn'),
};

function setNotice(msg, isError = false) {
  stateEls.notice.textContent = msg || '';
  stateEls.notice.style.color = isError ? '#b42318' : '#0f5132';
}

function secAgo(iso) {
  if (!iso) return 'never';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'unknown';
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  return `${diff} sec ago`;
}

function renderState(state) {
  const auth = state?.auth;
  const diagnostics = state?.diagnostics || {};
  const username = auth?.user?.username || 'Not logged in';
  const companyId = auth?.companyId || '-';
  const employeeId = auth?.employeeId || '-';
  const running = state?.running ? 'running' : 'stopped';
  const loggedIn = Boolean(auth?.user);

  stateEls.statusText.textContent = `User: ${username}\nCompany: ${companyId}\nEmployee: ${employeeId}\nCollector: ${running}`;
  stateEls.autoStart.checked = Boolean(state?.autoStart);
  stateEls.apiBaseUrl.value = auth?.apiBaseUrl || state?.defaultApiBaseUrl || 'http://localhost:3000';
  stateEls.apiBaseUrl.readOnly = Boolean(state?.apiLocked);

  stateEls.loginPanel.classList.toggle('hidden', loggedIn);
  stateEls.loggedInBanner.classList.toggle('hidden', !loggedIn);

  stateEls.startBtn.disabled = !loggedIn;
  stateEls.stopBtn.disabled = !loggedIn;
  stateEls.logoutBtn.disabled = !loggedIn;

  const upload = diagnostics?.upload || {};
  const collector = diagnostics?.collector || {};
  const api = diagnostics?.api || {};
  const authDiag = diagnostics?.auth || {};
  const cache = diagnostics?.cache || {};
  const update = diagnostics?.update || {};
  const diagLines = [
    `API: ${api.connected ? 'CONNECTED' : 'DISCONNECTED'} (${api.baseUrl || '-'})`,
    `JWT: ${(authDiag.jwtStatus || 'unknown').toUpperCase()}`,
    `Heartbeat: ${secAgo(upload.heartbeat)}`,
    `Window: ${secAgo(upload.windowEvent)}`,
    `Input: ${secAgo(upload.inputStats)}`,
    `Screenshot: ${secAgo(upload.screenshot)}`,
    `Telemetry: ${collector.telemetryOk ? 'OK' : 'NO SIGNAL'} (${secAgo(collector.lastTelemetryAt)})`,
    `Version: ${diagnostics.version || 'unknown'}`,
    `Runtime: ${diagnostics.runtime || 'unknown'}`,
    `Offline Queue: ${Number(cache.queueSize || 0)} pending`,
  ];
  if (api.lastError) {
    diagLines.push(`Last Error: ${api.lastError}`);
  }
  stateEls.diagText.textContent = diagLines.join('\n');

  const updateLines = [
    `Current: ${update.currentVersion || 'unknown'}`,
    `Latest: ${update.latestVersion || '-'}`,
    `Status: ${String(update.status || 'idle').toUpperCase()}`,
    `Checked: ${secAgo(update.lastCheckedAt)}`,
  ];
  if (update.lastError) {
    updateLines.push(`Error: ${update.lastError}`);
  }
  stateEls.updateText.textContent = updateLines.join('\n');
  stateEls.applyUpdateBtn.disabled = update.status !== 'downloaded';
}

async function refresh() {
  const state = await window.agentBridge.getState();
  renderState(state);
}

stateEls.loginBtn.addEventListener('click', async () => {
  try {
    const payload = {
      apiBaseUrl: stateEls.apiBaseUrl.value.trim(),
      account: stateEls.account.value.trim(),
      password: stateEls.password.value,
    };

    if (!payload.account || !payload.password) {
      setNotice('Please enter account and password.', true);
      return;
    }

    await window.agentBridge.login(payload);
    stateEls.password.value = '';
    setNotice('Login success. Agent started and bound to employee.');
    await refresh();
  } catch (err) {
    setNotice(err?.message || 'Login failed.', true);
  }
});

stateEls.startBtn.addEventListener('click', async () => {
  try {
    await window.agentBridge.start();
    setNotice('Collector started.');
    await refresh();
  } catch (err) {
    setNotice(err?.message || 'Start failed.', true);
  }
});

stateEls.stopBtn.addEventListener('click', async () => {
  try {
    await window.agentBridge.stop();
    setNotice('Collector stopped.');
    await refresh();
  } catch (err) {
    setNotice(err?.message || 'Stop failed.', true);
  }
});

stateEls.logoutBtn.addEventListener('click', async () => {
  try {
    await window.agentBridge.logout();
    setNotice('Logged out and binding removed.');
    await refresh();
  } catch (err) {
    setNotice(err?.message || 'Logout failed.', true);
  }
});

stateEls.autoStart.addEventListener('change', async () => {
  try {
    await window.agentBridge.setAutoStart(stateEls.autoStart.checked);
    setNotice(`Launch at startup ${stateEls.autoStart.checked ? 'enabled' : 'disabled'}.`);
    await refresh();
  } catch (err) {
    setNotice(err?.message || 'Failed to update startup option.', true);
  }
});

stateEls.checkUpdateBtn.addEventListener('click', async () => {
  try {
    const result = await window.agentBridge.checkUpdate();
    if (result?.updateAvailable) {
      setNotice(`Update ${result.latestVersion} downloaded. Click Install.`);
    } else {
      setNotice('Already up to date.');
    }
    await refresh();
  } catch (err) {
    setNotice(err?.message || 'Update check failed.', true);
  }
});

stateEls.applyUpdateBtn.addEventListener('click', async () => {
  try {
    setNotice('Installer is starting... app will exit.');
    await window.agentBridge.applyUpdate();
  } catch (err) {
    setNotice(err?.message || 'Failed to apply update.', true);
  }
});

refresh().catch((err) => {
  setNotice(err?.message || 'Failed to initialize.', true);
});

setInterval(() => {
  refresh().catch(() => {});
}, 10000);
