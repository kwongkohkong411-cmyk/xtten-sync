const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, desktopCapturer } = require('electron');
const { fork, spawn } = require('node:child_process');

const FALLBACK_API_BASE = process.env.ACTIVITY_API_BASE_URL || 'http://localhost:3000';

function loadAppConfig() {
  const configPath = path.join(__dirname, 'config.json');
  try {
    if (!fs.existsSync(configPath)) {
      return {
        apiBaseUrl: FALLBACK_API_BASE,
        lockApiBaseUrl: true,
      };
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return {
      apiBaseUrl: parsed.api || parsed.apiBaseUrl || FALLBACK_API_BASE,
      lockApiBaseUrl: parsed.lockApiBaseUrl !== false,
    };
  } catch {
    return {
      apiBaseUrl: FALLBACK_API_BASE,
      lockApiBaseUrl: true,
    };
  }
}

const APP_CONFIG = loadAppConfig();
const DEFAULT_API_BASE = APP_CONFIG.apiBaseUrl;
const SCREENSHOT_INTERVAL_MIN = Number(process.env.SCREENSHOT_INTERVAL_MIN || 1);
const SCREENSHOT_CAPTURE_WIDTH = Math.min(1280, Math.max(640, Number(process.env.SCREENSHOT_CAPTURE_WIDTH || 960)));
const SCREENSHOT_WEBP_QUALITY = Math.max(50, Math.min(60, Number(process.env.SCREENSHOT_WEBP_QUALITY || 55)));
const SCREENSHOT_TARGET_MAX_KB = Number(process.env.SCREENSHOT_TARGET_MAX_KB || 200);
const SCREENSHOT_HASH_SIMILARITY_SKIP = Number(process.env.SCREENSHOT_HASH_SIMILARITY_SKIP || 95);
const SCREENSHOT_RETRY_INTERVAL_SEC = Number(process.env.SCREENSHOT_RETRY_INTERVAL_SEC || 20);
const SCREENSHOT_RETRY_BATCH_SIZE = Number(process.env.SCREENSHOT_RETRY_BATCH_SIZE || 10);
const UPDATE_CHECK_INTERVAL_MIN = Number(process.env.UPDATE_CHECK_INTERVAL_MIN || 30);

let mainWindow = null;
let tray = null;
let isQuitting = false;
let agentProcess = null;
let stdoutBuffer = '';
let screenshotTimer = null;
let screenshotRetryTimer = null;
let updateTimer = null;

const screenshotDecisionState = {
  lastHash: null,
  lastWindowSignature: null,
  pendingInputDelta: 0,
  pendingKeyboardDelta: 0,
  pendingMouseDelta: 0,
};

const screenshotQueueDir = path.join(app.getPath('userData'), 'screenshot-queue');
const updatesDir = path.join(app.getPath('userData'), 'updates');
if (!fs.existsSync(screenshotQueueDir)) {
  fs.mkdirSync(screenshotQueueDir, { recursive: true });
}
if (!fs.existsSync(updatesDir)) {
  fs.mkdirSync(updatesDir, { recursive: true });
}

const diagnostics = {
  version: app.getVersion(),
  runtime: 'electron-node-powershell-telemetry+desktopcapturer-screenshot',
  auth: {
    loggedIn: false,
    lastLoginAt: null,
    lastLoginStatus: null,
    jwtPresent: false,
    jwtStatus: 'unknown',
  },
  collector: {
    running: false,
    lastStartAt: null,
    lastStopAt: null,
    lastTelemetryAt: null,
    telemetryOk: false,
  },
  upload: {
    heartbeat: null,
    windowEvent: null,
    inputStats: null,
    idleEvent: null,
    screenshot: null,
  },
  api: {
    baseUrl: DEFAULT_API_BASE,
    connected: false,
    lastError: null,
  },
  cache: {
    queueSize: 0,
    screenshotQueueSize: 0,
    totalQueueSize: 0,
  },
  update: {
    currentVersion: app.getVersion(),
    latestVersion: null,
    status: 'idle',
    lastCheckedAt: null,
    lastError: null,
    downloadedInstallerPath: null,
  },
};

const stateFile = path.join(app.getPath('userData'), 'agent-state.json');
const diagnosticsFile = path.join(app.getPath('userData'), 'diagnostics.json');

function persistDiagnostics() {
  try {
    fs.writeFileSync(diagnosticsFile, JSON.stringify(diagnostics, null, 2), 'utf8');
  } catch {}
}

function readState() {
  try {
    if (!fs.existsSync(stateFile)) return {};
    const raw = fs.readFileSync(stateFile, 'utf8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function writeState(nextState) {
  const merged = { ...readState(), ...nextState };
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function clearAuthState() {
  const current = readState();
  delete current.auth;
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(current, null, 2), 'utf8');
  return current;
}

function resolveAgentScriptPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'agent', 'activity-agent.js');
  }
  return path.resolve(__dirname, '..', 'activity-agent.js');
}

function getAgentRuntimeEnv(authState) {
  return {
    ...process.env,
    ACTIVITY_API_BASE_URL: authState.apiBaseUrl || DEFAULT_API_BASE,
    ACTIVITY_AGENT_TOKEN: authState.token || '',
    ACTIVITY_COMPANY_ID: authState.companyId || '',
    ACTIVITY_EMPLOYEE_ID: authState.employeeId || '',
  };
}

function mapChannelToUploadKey(channel) {
  if (channel.includes('/heartbeat')) return 'heartbeat';
  if (channel.includes('/window-event')) return 'windowEvent';
  if (channel.includes('/input-stats')) return 'inputStats';
  if (channel.includes('/idle-event')) return 'idleEvent';
  if (channel.includes('/screenshot')) return 'screenshot';
  return null;
}

function hammingDistanceHex(a, b) {
  const left = String(a || '').toLowerCase();
  const right = String(b || '').toLowerCase();
  if (!left || !right || left.length !== right.length) return 64;

  let distance = 0;
  for (let i = 0; i < left.length; i += 1) {
    const x = Number.parseInt(left[i], 16);
    const y = Number.parseInt(right[i], 16);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      distance += 4;
      continue;
    }
    let z = x ^ y;
    while (z) {
      distance += z & 1;
      z >>= 1;
    }
  }

  return distance;
}

function hashSimilarityPercent(current, previous) {
  const bits = 64;
  const distance = hammingDistanceHex(current, previous);
  return Number((((bits - distance) / bits) * 100).toFixed(2));
}

function computeDHashHex(image) {
  const resized = image.resize({ width: 9, height: 8, quality: 'best' });
  const bitmap = resized.toBitmap();
  const bytesPerPixel = 4;
  const width = 9;
  const height = 8;

  const grayAt = (x, y) => {
    const idx = (y * width + x) * bytesPerPixel;
    const b = bitmap[idx] || 0;
    const g = bitmap[idx + 1] || 0;
    const r = bitmap[idx + 2] || 0;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };

  let out = '';
  let nibble = 0;
  let nibbleBits = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const bit = grayAt(x, y) > grayAt(x + 1, y) ? 1 : 0;
      nibble = (nibble << 1) | bit;
      nibbleBits += 1;
      if (nibbleBits === 4) {
        out += nibble.toString(16);
        nibble = 0;
        nibbleBits = 0;
      }
    }
  }
  return out.padStart(16, '0');
}

function shouldUploadScreenshot({ hash, windowSignature }) {
  const previousHash = screenshotDecisionState.lastHash;
  const keyboardDelta = Number(screenshotDecisionState.pendingKeyboardDelta || 0);
  const mouseDelta = Number(screenshotDecisionState.pendingMouseDelta || 0);
  const inputDelta = Number(screenshotDecisionState.pendingInputDelta || 0);

  const previousWindow = screenshotDecisionState.lastWindowSignature;
  const windowChanged = Boolean(windowSignature && previousWindow && windowSignature !== previousWindow);
  const similarity = previousHash ? hashSimilarityPercent(hash, previousHash) : 0;
  const hashUnchanged = Boolean(previousHash) && similarity >= SCREENSHOT_HASH_SIMILARITY_SKIP;
  const hasInput = inputDelta > 0 || keyboardDelta > 0 || mouseDelta > 0;

  const allowUpload = !hashUnchanged || !previousHash;

  return {
    allowUpload,
    reason: allowUpload ? (!hashUnchanged ? 'hash_changed' : 'first_frame') : 'skip_high_similarity',
    similarity,
    hashUnchanged,
    hasInput,
    windowChanged,
    keyboardDelta,
    mouseDelta,
  };
}

function setQueueStats(partial = {}) {
  diagnostics.cache = {
    ...diagnostics.cache,
    ...partial,
  };
  diagnostics.cache.totalQueueSize =
    Number(diagnostics.cache.queueSize || 0) + Number(diagnostics.cache.screenshotQueueSize || 0);
  persistDiagnostics();
}

function screenshotQueueFilePath(id) {
  return path.join(screenshotQueueDir, `${id}.json`);
}

function parseVersion(v) {
  return String(v || '0.0.0')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
}

function isVersionNewer(current, target) {
  const a = parseVersion(current);
  const b = parseVersion(target);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (y > x) return true;
    if (y < x) return false;
  }
  return false;
}

function resolveApiBaseForUpdate() {
  return (readState().auth?.apiBaseUrl || DEFAULT_API_BASE).replace(/\/$/, '');
}

async function fetchReleaseInfo() {
  const base = resolveApiBaseForUpdate();
  const res = await fetch(`${base}/agent/releases`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`release check failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  return { base, json };
}

function pickWindowsExeArtifact(releaseJson) {
  const list = releaseJson?.platforms?.windows?.artifacts || [];
  return list.find((a) => a.format === 'exe' && a.available) || null;
}

async function downloadUpdateInstaller(downloadUrl, version) {
  const target = path.join(updatesDir, `xtten-agent-setup-${version}.exe`);
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`download update failed: ${res.status} ${text}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(target, buf);
  return target;
}

async function checkForUpdates({ silent = false } = {}) {
  diagnostics.update.status = 'checking';
  diagnostics.update.lastCheckedAt = new Date().toISOString();
  diagnostics.update.lastError = null;
  persistDiagnostics();

  try {
    const { base, json } = await fetchReleaseInfo();
    const latestVersion = String(json?.version || '0.0.0');
    diagnostics.update.latestVersion = latestVersion;

    if (!isVersionNewer(app.getVersion(), latestVersion)) {
      diagnostics.update.status = 'up_to_date';
      diagnostics.update.downloadedInstallerPath = null;
      persistDiagnostics();
      return { ok: true, updateAvailable: false, latestVersion };
    }

    const artifact = pickWindowsExeArtifact(json);
    if (!artifact) {
      diagnostics.update.status = 'update_unavailable';
      diagnostics.update.lastError = 'new version exists but windows exe is not published';
      persistDiagnostics();
      return { ok: true, updateAvailable: false, latestVersion };
    }

    const absoluteUrl = artifact.downloadUrl.startsWith('http')
      ? artifact.downloadUrl
      : `${base}${artifact.downloadUrl}`;

    diagnostics.update.status = 'downloading';
    persistDiagnostics();

    const installerPath = await downloadUpdateInstaller(absoluteUrl, latestVersion);
    diagnostics.update.status = 'downloaded';
    diagnostics.update.downloadedInstallerPath = installerPath;
    persistDiagnostics();

    return {
      ok: true,
      updateAvailable: true,
      latestVersion,
      installerPath,
    };
  } catch (err) {
    diagnostics.update.status = silent ? 'idle' : 'check_failed';
    diagnostics.update.lastError = String(err?.message || err);
    persistDiagnostics();
    if (silent) {
      return { ok: false, silent: true, error: diagnostics.update.lastError };
    }
    throw err;
  }
}

function applyDownloadedUpdate() {
  const installerPath = diagnostics.update.downloadedInstallerPath;
  if (!installerPath || !fs.existsSync(installerPath)) {
    throw new Error('No downloaded update installer found. Please check for updates first.');
  }

  diagnostics.update.status = 'installing';
  persistDiagnostics();

  stopAgent();
  stopMainScreenshotSchedulers();

  spawn(installerPath, ['/S'], {
    detached: true,
    stdio: 'ignore',
  }).unref();

  isQuitting = true;
  app.quit();
}

function scheduleAutoUpdateChecks() {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
  const ms = Math.max(5, UPDATE_CHECK_INTERVAL_MIN) * 60 * 1000;
  updateTimer = setInterval(() => {
    checkForUpdates({ silent: true }).catch(() => {});
  }, ms);
}

async function countScreenshotQueue() {
  const files = await fs.promises.readdir(screenshotQueueDir);
  return files.filter((f) => f.endsWith('.json')).length;
}

async function refreshScreenshotQueueCount() {
  const count = await countScreenshotQueue();
  setQueueStats({ screenshotQueueSize: count });
  return count;
}

async function enqueueScreenshotRetry(authState, imageBuffer, metadata = {}) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const item = {
    id,
    apiBaseUrl: authState.apiBaseUrl || DEFAULT_API_BASE,
    token: authState.token,
    companyId: authState.companyId,
    employeeId: authState.employeeId,
    capturedAt: new Date().toISOString(),
    imageBase64: imageBuffer.toString('base64'),
    mimeType: 'image/webp',
    metadata,
    attempts: 0,
    nextRetryAt: Date.now(),
  };
  await fs.promises.writeFile(screenshotQueueFilePath(id), JSON.stringify(item), 'utf8');
  await refreshScreenshotQueueCount();
}

async function uploadActivityScreenshot(authState, imageBuffer, capturedAt, metadata = {}) {
  const base = (authState.apiBaseUrl || DEFAULT_API_BASE).replace(/\/$/, '');
  const url = `${base}/activity/screenshots${authState.companyId ? `?companyId=${encodeURIComponent(authState.companyId)}` : ''}`;
  const sha256 = createHash('sha256').update(imageBuffer).digest('hex');

  const body = {
    employeeId: authState.employeeId,
    capturedAt,
    imageBase64: `data:image/webp;base64,${imageBuffer.toString('base64')}`,
    appName: String(metadata.appName || ''),
    windowTitle: String(metadata.windowTitle || ''),
    keyboardCount: Number(metadata.keyboardDelta || 0),
    mouseCount: Number(metadata.mouseDelta || 0),
    idleSec: Number(metadata.idleSec || 0),
    captureSource: String(metadata.captureSource || 'SCREENSHOT'),
    sha256,
    perceptualHash: String(metadata.dhash || ''),
    hash: String(metadata.dhash || ''),
    width: Number(metadata.width || 0) || undefined,
    height: Number(metadata.height || 0) || undefined,
    metadata: {
      source: 'electron-main',
      platform: process.platform,
      sha256,
      perceptualHash: String(metadata.dhash || ''),
      hashSimilarity: Number(metadata.hashSimilarity || 0),
      decisionReason: String(metadata.decisionReason || ''),
      windowSignature: String(metadata.windowSignature || ''),
      ...metadata,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authState.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`screenshot upload failed: ${res.status} ${text}`);
  }

  diagnostics.upload.screenshot = new Date().toISOString();
  diagnostics.api.connected = true;
  diagnostics.api.lastError = null;
}

async function captureScreenshotWebp() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 },
    fetchWindowIcons: false,
  });

  const source = sources.find((s) => !s.thumbnail.isEmpty()) || sources[0];
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('desktop capture returned empty frame');
  }

  const frame = source.thumbnail;
  const frameSize = frame.getSize();
  const width = Math.min(SCREENSHOT_CAPTURE_WIDTH, Math.max(1, frameSize.width));
  const quality = SCREENSHOT_WEBP_QUALITY;

  const png = frame.toPNG();
  const webp = await sharp(png)
    .resize({
      width,
      withoutEnlargement: true,
      fit: 'inside',
    })
    .webp({
      quality,
      effort: 4,
    })
    .toBuffer();

  const previewImage = nativeImage.createFromBuffer(webp);
  const finalSize = previewImage.getSize();
  const dhash = computeDHashHex(previewImage);
  return {
    image: webp,
    meta: {
      format: 'webp',
      webpQuality: quality,
      width: finalSize.width,
      height: finalSize.height,
      bytes: webp.length,
      targetMaxKb: SCREENSHOT_TARGET_MAX_KB,
      dhash,
    },
  };
}

async function captureAndUploadScreenshot() {
  const authState = readState().auth;
  if (!authState?.token || !authState?.employeeId) return;

  try {
    const captured = await captureScreenshotWebp();
    const capturedAt = new Date().toISOString();
    const decision = shouldUploadScreenshot({
      hash: captured.meta.dhash,
      windowSignature: screenshotDecisionState.lastWindowSignature,
    });

    if (!decision.allowUpload) {
      screenshotDecisionState.lastHash = captured.meta.dhash;
      screenshotDecisionState.pendingInputDelta = 0;
      screenshotDecisionState.pendingKeyboardDelta = 0;
      screenshotDecisionState.pendingMouseDelta = 0;
      diagnostics.api.lastError = null;
      persistDiagnostics();
      return;
    }

    await uploadActivityScreenshot(authState, captured.image, capturedAt, {
      mode: 'live',
      decisionReason: decision.reason,
      hashSimilarity: decision.similarity,
      hashUnchanged: decision.hashUnchanged,
      hasInput: decision.hasInput,
      windowChanged: decision.windowChanged,
      keyboardDelta: decision.keyboardDelta,
      mouseDelta: decision.mouseDelta,
      windowSignature: screenshotDecisionState.lastWindowSignature,
      captureSource: decision.windowChanged ? 'WINDOW_CHANGE' : decision.hasInput ? 'MANUAL' : 'SCREENSHOT',
      ...captured.meta,
    });

    screenshotDecisionState.lastHash = captured.meta.dhash;
    screenshotDecisionState.pendingInputDelta = 0;
    screenshotDecisionState.pendingKeyboardDelta = 0;
    screenshotDecisionState.pendingMouseDelta = 0;
  } catch (err) {
    diagnostics.api.connected = false;
    diagnostics.api.lastError = String(err?.message || err);
    try {
      const captured = await captureScreenshotWebp();
      await enqueueScreenshotRetry(authState, captured.image, {
        mode: 'cached',
        ...captured.meta,
      });
    } catch (cacheErr) {
      diagnostics.api.lastError = String(cacheErr?.message || cacheErr);
    }
  }
}

async function flushScreenshotRetryQueue() {
  const files = (await fs.promises.readdir(screenshotQueueDir))
    .filter((f) => f.endsWith('.json'))
    .sort();

  const now = Date.now();
  const ready = [];
  for (const file of files) {
    const fullPath = path.join(screenshotQueueDir, file);
    try {
      const raw = await fs.promises.readFile(fullPath, 'utf8');
      const item = JSON.parse(raw || '{}');
      if (Number(item.nextRetryAt || 0) <= now) {
        ready.push({ fullPath, item });
      }
    } catch {
      await fs.promises.unlink(fullPath).catch(() => {});
    }
    if (ready.length >= SCREENSHOT_RETRY_BATCH_SIZE) break;
  }

  for (const { fullPath, item } of ready) {
    try {
      const image = Buffer.from(String(item.imageBase64 || ''), 'base64');
      await uploadActivityScreenshot(item, image, item.capturedAt || new Date().toISOString(), {
        ...(item.metadata || {}),
        replay: true,
      });
      await fs.promises.unlink(fullPath).catch(() => {});
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.includes('401') || msg.includes('403')) {
        await fs.promises.unlink(fullPath).catch(() => {});
      } else {
        const attempts = Number(item.attempts || 0) + 1;
        const delaySec = Math.min(300, Math.max(10, Math.pow(2, attempts) * 5));
        const next = {
          ...item,
          attempts,
          nextRetryAt: Date.now() + delaySec * 1000,
          lastErrorAt: new Date().toISOString(),
        };
        await fs.promises.writeFile(fullPath, JSON.stringify(next), 'utf8');
      }
      diagnostics.api.connected = false;
      diagnostics.api.lastError = msg;
    }
  }

  await refreshScreenshotQueueCount();
}

function scheduleMainScreenshots() {
  const intervalMs = Math.max(1, SCREENSHOT_INTERVAL_MIN) * 60 * 1000;
  if (screenshotTimer) {
    clearInterval(screenshotTimer);
    screenshotTimer = null;
  }
  screenshotTimer = setInterval(() => {
    captureAndUploadScreenshot().catch((err) => {
      diagnostics.api.lastError = String(err?.message || err);
    });
  }, intervalMs);
}

function scheduleScreenshotRetryQueue() {
  if (screenshotRetryTimer) {
    clearInterval(screenshotRetryTimer);
    screenshotRetryTimer = null;
  }
  screenshotRetryTimer = setInterval(() => {
    flushScreenshotRetryQueue().catch((err) => {
      diagnostics.api.lastError = String(err?.message || err);
    });
  }, Math.max(5, SCREENSHOT_RETRY_INTERVAL_SEC) * 1000);
}

function stopMainScreenshotSchedulers() {
  if (screenshotTimer) {
    clearInterval(screenshotTimer);
    screenshotTimer = null;
  }
  if (screenshotRetryTimer) {
    clearInterval(screenshotRetryTimer);
    screenshotRetryTimer = null;
  }
}

function updateDiagnosticsFromAgentLine(line) {
  let payload;
  try {
    payload = JSON.parse(line);
  } catch {
    return;
  }

  if (payload?.kind !== 'diag') return;

  if (payload.event === 'agent_started') {
    diagnostics.collector.lastStartAt = payload.at;
    diagnostics.collector.running = true;
    diagnostics.api.baseUrl = payload.apiBaseUrl || diagnostics.api.baseUrl;
    diagnostics.auth.jwtPresent = Boolean(payload.hasToken);
    diagnostics.auth.jwtStatus = payload.hasToken ? 'valid' : 'missing';
  }

  if (payload.event === 'telemetry_started' || payload.event === 'telemetry_tick') {
    diagnostics.collector.lastTelemetryAt = payload.at;
    diagnostics.collector.telemetryOk = true;

    if (payload.event === 'telemetry_tick') {
      screenshotDecisionState.lastWindowSignature = payload.windowSignature || screenshotDecisionState.lastWindowSignature;
      screenshotDecisionState.pendingInputDelta += Number(payload.inputDelta || 0);
      screenshotDecisionState.pendingKeyboardDelta += Number(payload.keyboardDelta || 0);
      screenshotDecisionState.pendingMouseDelta +=
        Number(payload.mouseClickDelta || 0) + Number(payload.mouseMoveDelta || 0);
    }
  }

  if (payload.event === 'telemetry_exit') {
    diagnostics.collector.telemetryOk = false;
    diagnostics.api.lastError = `telemetry exited with code ${payload.code}`;
  }

  if (payload.event === 'telemetry_stderr') {
    diagnostics.api.lastError = payload.message || 'telemetry stderr';
  }

  if (payload.event === 'upload_ok') {
    const key = mapChannelToUploadKey(String(payload.channel || ''));
    if (key) diagnostics.upload[key] = payload.at;
    diagnostics.api.connected = true;
    diagnostics.api.lastError = null;
    diagnostics.auth.jwtStatus = diagnostics.auth.jwtPresent ? 'valid' : diagnostics.auth.jwtStatus;
  }

  if (payload.event === 'upload_error') {
    const key = mapChannelToUploadKey(String(payload.channel || ''));
    if (key) diagnostics.upload[key] = null;
    diagnostics.api.connected = false;
    diagnostics.api.lastError = payload.error || `upload failed on ${payload.channel}`;
    if (Number(payload.status) === 401 || Number(payload.status) === 403) {
      diagnostics.auth.jwtStatus = 'invalid';
    }
  }

  if (payload.event === 'cached_event' || payload.event === 'retry_ok') {
    setQueueStats({ queueSize: Number(payload.queueSize || 0) });
  }

  if (payload.event === 'retry_drop') {
    diagnostics.api.lastError = `retry dropped: ${payload.reason || 'unknown'}`;
  }

  persistDiagnostics();
}

function stopAgent() {
  if (!agentProcess) return false;
  agentProcess.kill();
  agentProcess = null;
  screenshotDecisionState.lastHash = null;
  screenshotDecisionState.lastWindowSignature = null;
  screenshotDecisionState.pendingInputDelta = 0;
  screenshotDecisionState.pendingKeyboardDelta = 0;
  screenshotDecisionState.pendingMouseDelta = 0;
  stopMainScreenshotSchedulers();
  diagnostics.collector.running = false;
  diagnostics.collector.lastStopAt = new Date().toISOString();
  diagnostics.collector.telemetryOk = false;
  persistDiagnostics();
  return true;
}

function startAgent() {
  const current = readState();
  const authState = current.auth;
  if (!authState?.token || !authState?.employeeId) {
    throw new Error('Agent is not bound yet. Please login first.');
  }

  if (agentProcess) return { running: true };

  const scriptPath = resolveAgentScriptPath();
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Agent script not found: ${scriptPath}`);
  }

  screenshotDecisionState.lastHash = null;
  screenshotDecisionState.lastWindowSignature = null;
  screenshotDecisionState.pendingInputDelta = 0;
  screenshotDecisionState.pendingKeyboardDelta = 0;
  screenshotDecisionState.pendingMouseDelta = 0;

  agentProcess = fork(scriptPath, [], {
    env: getAgentRuntimeEnv(authState),
    silent: true,
  });

  agentProcess.stdout?.on('data', (buf) => {
    const chunk = String(buf);
    console.log(`[agent] ${chunk.trim()}`);
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    lines.forEach((line) => updateDiagnosticsFromAgentLine(line.trim()));
  });
  agentProcess.stderr?.on('data', (buf) => {
    console.error(`[agent] ${String(buf).trim()}`);
    diagnostics.api.lastError = String(buf).trim();
  });
  agentProcess.on('exit', (code) => {
    console.log(`[agent] exited with code ${code}`);
    agentProcess = null;
    diagnostics.collector.running = false;
    diagnostics.collector.telemetryOk = false;
    diagnostics.collector.lastStopAt = new Date().toISOString();
    diagnostics.api.lastError = `collector exited with code ${code}`;
  });

  diagnostics.collector.running = true;
  diagnostics.collector.lastStartAt = new Date().toISOString();
  diagnostics.api.baseUrl = authState.apiBaseUrl || DEFAULT_API_BASE;
  diagnostics.auth.jwtPresent = Boolean(authState.token);

  scheduleMainScreenshots();
  scheduleScreenshotRetryQueue();
  captureAndUploadScreenshot().catch(() => {});
  persistDiagnostics();

  return { running: true };
}

function mapAuthResponse(auth, apiBaseUrl) {
  return {
    token: auth.access_token,
    user: auth.user,
    apiBaseUrl,
    companyId: auth.user?.companyId || '',
    employeeId: auth.user?.employeeId || '',
    boundAt: new Date().toISOString(),
  };
}

async function loginAndBind({ account, password, apiBaseUrl }) {
  const targetBase = ((APP_CONFIG.lockApiBaseUrl ? DEFAULT_API_BASE : (apiBaseUrl || DEFAULT_API_BASE)) || DEFAULT_API_BASE).replace(/\/$/, '');
  const res = await fetch(`${targetBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password }),
  });

  if (!res.ok) {
    diagnostics.auth.lastLoginStatus = res.status;
    diagnostics.auth.loggedIn = false;
    diagnostics.api.connected = false;
    const text = await res.text();
    throw new Error(text || `Login failed (${res.status})`);
  }

  const payload = await res.json();
  if (!payload?.access_token || !payload?.user?.employeeId) {
    throw new Error('Employee binding missing. Ensure this account has linked employee profile.');
  }

  const authState = mapAuthResponse(payload, targetBase);
  writeState({ auth: authState });

  diagnostics.auth.loggedIn = true;
  diagnostics.auth.jwtPresent = Boolean(authState.token);
  diagnostics.auth.jwtStatus = 'valid';
  diagnostics.auth.lastLoginAt = new Date().toISOString();
  diagnostics.auth.lastLoginStatus = 200;
  diagnostics.api.connected = true;
  diagnostics.api.lastError = null;
  diagnostics.api.baseUrl = targetBase;
  persistDiagnostics();

  startAgent();
  return authState;
}

function ensureWindow() {
  if (mainWindow) return mainWindow;

  mainWindow = new BrowserWindow({
    width: 420,
    height: 620,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  return mainWindow;
}

function buildTrayMenu() {
  const state = readState();
  const isAutoStart = app.getLoginItemSettings().openAtLogin;
  return Menu.buildFromTemplate([
    { label: 'Open XTTEN Agent', click: () => ensureWindow().show() },
    { type: 'separator' },
    {
      label: agentProcess ? 'Stop Collector' : 'Start Collector',
      click: () => {
        try {
          if (agentProcess) stopAgent();
          else startAgent();
        } catch (err) {
          console.error(err);
        }
      },
    },
    {
      label: 'Launch at startup',
      type: 'checkbox',
      checked: isAutoStart,
      click: (menuItem) => {
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked,
          openAsHidden: true,
          args: ['--hidden'],
        });
      },
    },
    { type: 'separator' },
    { label: `Bound user: ${state?.auth?.user?.username || 'none'}`, enabled: false },
    { label: `Company: ${state?.auth?.companyId || 'none'}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray() {
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
    return;
  }
  const icon = nativeImage.createFromPath(process.execPath);
  tray = new Tray(icon);
  tray.setToolTip('XTTEN Agent');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', () => {
    ensureWindow().show();
  });
}

function getPublicState() {
  const state = readState();
  diagnostics.auth.loggedIn = Boolean(state.auth?.token);
  diagnostics.auth.jwtPresent = Boolean(state.auth?.token);
  if (!diagnostics.auth.jwtPresent) diagnostics.auth.jwtStatus = 'missing';
  diagnostics.collector.running = Boolean(agentProcess);
  persistDiagnostics();

  return {
    auth: state.auth
      ? {
          apiBaseUrl: state.auth.apiBaseUrl,
          companyId: state.auth.companyId,
          employeeId: state.auth.employeeId,
          user: state.auth.user,
          boundAt: state.auth.boundAt,
        }
      : null,
    running: Boolean(agentProcess),
    autoStart: app.getLoginItemSettings().openAtLogin,
    defaultApiBaseUrl: DEFAULT_API_BASE,
    apiLocked: APP_CONFIG.lockApiBaseUrl,
    diagnostics,
  };
}

ipcMain.handle('agent:state', async () => getPublicState());

ipcMain.handle('auth:login', async (_event, payload) => {
  const auth = await loginAndBind(payload || {});
  createTray();
  return {
    ok: true,
    auth: {
      apiBaseUrl: auth.apiBaseUrl,
      companyId: auth.companyId,
      employeeId: auth.employeeId,
      user: auth.user,
      boundAt: auth.boundAt,
    },
  };
});

ipcMain.handle('auth:logout', async () => {
  stopAgent();
  clearAuthState();
  diagnostics.auth.loggedIn = false;
  diagnostics.auth.jwtPresent = false;
  diagnostics.auth.jwtStatus = 'missing';
  persistDiagnostics();
  createTray();
  return { ok: true };
});

ipcMain.handle('agent:start', async () => {
  const out = startAgent();
  createTray();
  return { ok: true, ...out };
});

ipcMain.handle('agent:stop', async () => {
  const stopped = stopAgent();
  createTray();
  return { ok: true, stopped };
});

ipcMain.handle('app:auto-start', async (_event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    openAsHidden: true,
    args: ['--hidden'],
  });
  createTray();
  return { ok: true, autoStart: app.getLoginItemSettings().openAtLogin };
});

ipcMain.handle('update:check', async () => {
  const result = await checkForUpdates({ silent: false });
  return {
    ok: true,
    ...result,
  };
});

ipcMain.handle('update:apply', async () => {
  applyDownloadedUpdate();
  return { ok: true };
});

app.whenReady().then(() => {
  const hiddenStart = process.argv.includes('--hidden');
  ensureWindow();

  const hasAuth = Boolean(readState().auth?.token);
  refreshScreenshotQueueCount().catch(() => {});
  scheduleAutoUpdateChecks();
  checkForUpdates({ silent: true }).catch(() => {});
  persistDiagnostics();
  if (hasAuth) {
    try {
      startAgent();
    } catch (err) {
      console.error('auto start agent failed', err);
    }
  }

  createTray();

  if (!hiddenStart || !hasAuth) {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopAgent();
  stopMainScreenshotSchedulers();
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
