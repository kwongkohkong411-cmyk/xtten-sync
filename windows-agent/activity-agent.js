const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");

const API_BASE_URL = process.env.ACTIVITY_API_BASE_URL || "http://localhost:3000";
const TOKEN = process.env.ACTIVITY_AGENT_TOKEN || "";
const COMPANY_ID = process.env.ACTIVITY_COMPANY_ID || "";
const EMPLOYEE_ID = process.env.ACTIVITY_EMPLOYEE_ID || "";
const CACHE_DIR = process.env.ACTIVITY_CACHE_DIR || path.join(os.homedir(), ".xtten-agent-cache");
const RETRY_INTERVAL_SEC = Number(process.env.RETRY_INTERVAL_SEC || 15);
const RETRY_MAX_BACKOFF_SEC = Number(process.env.RETRY_MAX_BACKOFF_SEC || 300);
const RETRY_BATCH_SIZE = Number(process.env.RETRY_BATCH_SIZE || 25);
const JPEG_QUALITY = Number(process.env.SCREENSHOT_JPEG_QUALITY || 70);
const AFK_THRESHOLD_SEC = Number(process.env.AFK_THRESHOLD_SEC || 60);
const HEARTBEAT_ACTIVE_SEC = Number(process.env.HEARTBEAT_ACTIVE_SEC || process.env.HEARTBEAT_INTERVAL_SEC || 15);
const HEARTBEAT_IDLE_SEC = Number(process.env.HEARTBEAT_IDLE_SEC || 45);
const INPUT_FLUSH_ACTIVE_SEC = Number(process.env.INPUT_FLUSH_ACTIVE_SEC || process.env.INPUT_FLUSH_INTERVAL_SEC || 30);
const INPUT_FLUSH_IDLE_SEC = Number(process.env.INPUT_FLUSH_IDLE_SEC || 90);
const WINDOW_FLUSH_ACTIVE_SEC = Number(process.env.WINDOW_FLUSH_ACTIVE_SEC || 15);
const WINDOW_FLUSH_IDLE_SEC = Number(process.env.WINDOW_FLUSH_IDLE_SEC || 60);

let lastTelemetryDiagMs = 0;

function emitDiag(event, data = {}) {
  const payload = {
    kind: "diag",
    event,
    at: new Date().toISOString(),
    ...data,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

if (!EMPLOYEE_ID) {
  throw new Error("ACTIVITY_EMPLOYEE_ID is required");
}

if (!TOKEN) {
  throw new Error("ACTIVITY_AGENT_TOKEN is required");
}

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

if (JPEG_QUALITY < 60 || JPEG_QUALITY > 75) {
  throw new Error("SCREENSHOT_JPEG_QUALITY must be between 60 and 75 for v1 compression policy");
}

function apiUrl(pathname) {
  return `${API_BASE_URL}${pathname}${COMPANY_ID ? `?companyId=${encodeURIComponent(COMPANY_ID)}` : ""}`;
}

async function postJson(pathname, body) {
  const res = await fetch(apiUrl(pathname), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });

  if (!res.ok) {
    const text = await res.text();
    emitDiag("upload_error", {
      channel: pathname,
      status: res.status,
      error: text,
    });
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }

  emitDiag("upload_ok", {
    channel: pathname,
    status: res.status,
  });

  return res.json();
}

function cacheFilePath(id) {
  return path.join(CACHE_DIR, `${id}.json`);
}

async function countCachedEvents() {
  const files = await fs.promises.readdir(CACHE_DIR);
  return files.filter((f) => f.endsWith(".json")).length;
}

async function enqueueCachedEvent(pathname, body) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const payload = {
    id,
    pathname,
    body,
    attempts: 0,
    createdAt: new Date().toISOString(),
    nextRetryAt: Date.now(),
  };
  await fs.promises.writeFile(cacheFilePath(id), JSON.stringify(payload), "utf8");
  const pending = await countCachedEvents();
  emitDiag("cached_event", {
    channel: pathname,
    queueSize: pending,
  });
}

function retryDelaySec(attempts) {
  return Math.min(RETRY_MAX_BACKOFF_SEC, Math.max(5, Math.pow(2, attempts) * 5));
}

async function readCachedEvents() {
  const files = (await fs.promises.readdir(CACHE_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();
  const out = [];
  for (const file of files) {
    const fullPath = path.join(CACHE_DIR, file);
    try {
      const raw = await fs.promises.readFile(fullPath, "utf8");
      const item = JSON.parse(raw);
      out.push({ item, fullPath });
    } catch {
      await fs.promises.unlink(fullPath).catch(() => {});
    }
  }
  return out;
}

async function markRetryLater(fullPath, item) {
  const attempts = Number(item.attempts || 0) + 1;
  const delaySec = retryDelaySec(attempts);
  const next = {
    ...item,
    attempts,
    nextRetryAt: Date.now() + delaySec * 1000,
    lastErrorAt: new Date().toISOString(),
  };
  await fs.promises.writeFile(fullPath, JSON.stringify(next), "utf8");
  emitDiag("retry_scheduled", {
    channel: item.pathname,
    attempts,
    delaySec,
  });
}

async function flushCachedQueue() {
  const all = await readCachedEvents();
  const now = Date.now();
  const ready = all.filter(({ item }) => Number(item.nextRetryAt || 0) <= now).slice(0, RETRY_BATCH_SIZE);
  if (ready.length === 0) return;

  for (const { item, fullPath } of ready) {
    try {
      await postJson(item.pathname, item.body);
      await fs.promises.unlink(fullPath).catch(() => {});
      const pending = await countCachedEvents();
      emitDiag("retry_ok", {
        channel: item.pathname,
        queueSize: pending,
      });
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.includes("401") || msg.includes("403")) {
        await fs.promises.unlink(fullPath).catch(() => {});
        emitDiag("retry_drop", {
          channel: item.pathname,
          reason: "auth_error",
        });
      } else {
        await markRetryLater(fullPath, item);
      }
    }
  }
}

async function safePostJson(pathname, body) {
  try {
    return await postJson(pathname, body);
  } catch (err) {
    await enqueueCachedEvent(pathname, body);
    throw err;
  }
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

const state = {
  currentWindow: null,
  windowStartedAtMs: Date.now(),
  lastHeartbeatAtMs: Date.now(),
  afk: false,
  lastIdleSec: 0,
  keyboardCount: 0,
  mouseCount: 0,
  mouseMoveCount: 0,
};

function heartbeatIntervalSec() {
  return state.afk ? HEARTBEAT_IDLE_SEC : HEARTBEAT_ACTIVE_SEC;
}

function inputFlushIntervalSec() {
  return state.afk ? INPUT_FLUSH_IDLE_SEC : INPUT_FLUSH_ACTIVE_SEC;
}

function windowFlushIntervalSec() {
  return state.afk ? WINDOW_FLUSH_IDLE_SEC : WINDOW_FLUSH_ACTIVE_SEC;
}

function windowSignature(t) {
  return `${t.processName || ""}::${t.windowTitle || ""}::${t.domain || ""}`;
}

async function flushWindowEvent(force = false) {
  if (!state.currentWindow) return;
  const now = Date.now();
  const durationSec = Math.max(1, Math.floor((now - state.windowStartedAtMs) / 1000));
  if (!force && durationSec < 5) return;

  const payload = {
    employeeId: EMPLOYEE_ID,
    appName: state.currentWindow.appName || state.currentWindow.processName || "Unknown",
    windowTitle: state.currentWindow.windowTitle || "",
    processName: state.currentWindow.processName || "",
    url: state.currentWindow.url || null,
    domain: state.currentWindow.domain || null,
    durationSec,
    capturedAt: new Date().toISOString(),
    metadata: {
      host: os.hostname(),
      platform: "windows",
      source: "windows-agent",
      forced: force,
    },
  };

  await safePostJson("/activity/ingest/window-event", payload);
  state.windowStartedAtMs = now;
}

async function flushInputStats(force = false) {
  if (!force && state.keyboardCount === 0 && state.mouseCount === 0) return;

  await safePostJson("/activity/ingest/input-stats", {
    employeeId: EMPLOYEE_ID,
    keyboardCount: state.keyboardCount,
    mouseCount: state.mouseCount,
    capturedAt: new Date().toISOString(),
    metadata: {
      host: os.hostname(),
      platform: "windows",
      source: "windows-agent",
      mouseMoveCount: state.mouseMoveCount,
    },
  });

  state.keyboardCount = 0;
  state.mouseCount = 0;
  state.mouseMoveCount = 0;
}

async function sendHeartbeat(idleSec) {
  const currentHeartbeatSec = heartbeatIntervalSec();
  await safePostJson("/activity/ingest/heartbeat", {
    employeeId: EMPLOYEE_ID,
    heartbeatSec: currentHeartbeatSec,
    idleSec,
    isAfk: idleSec >= AFK_THRESHOLD_SEC,
    capturedAt: new Date().toISOString(),
    metadata: {
      host: os.hostname(),
      platform: "windows",
      source: "windows-agent",
      afkThresholdSec: AFK_THRESHOLD_SEC,
      samplingMode: state.afk ? "idle" : "active",
    },
  });
}

async function maybeSendAfkEvent(idleSec) {
  const afkNow = idleSec >= AFK_THRESHOLD_SEC;
  if (afkNow === state.afk) return;
  state.afk = afkNow;

  await safePostJson("/activity/ingest/idle-event", {
    employeeId: EMPLOYEE_ID,
    idleSec,
    capturedAt: new Date().toISOString(),
    metadata: {
      host: os.hostname(),
      platform: "windows",
      source: "windows-agent",
      transition: afkNow ? "to_afk" : "to_active",
      afkThresholdSec: AFK_THRESHOLD_SEC,
    },
  });
}

async function handleTelemetry(raw) {
  if (!raw) return;

  const telemetry = {
    timestamp: raw.timestamp,
    appName: raw.appName || raw.processName || "Unknown",
    windowTitle: raw.windowTitle || "",
    processName: raw.processName || "",
    url: raw.url || null,
    domain: raw.domain || null,
    idleSec: Number(raw.idleSec || 0),
    keyboardDelta: Number(raw.keyboardDelta || 0),
    mouseClickDelta: Number(raw.mouseClickDelta || 0),
    mouseMoveDelta: Number(raw.mouseMoveDelta || 0),
  };

  const now = Date.now();
  if (now - lastTelemetryDiagMs >= 5000) {
    lastTelemetryDiagMs = now;
    const signature = windowSignature(telemetry);
    const inputDelta = telemetry.keyboardDelta + telemetry.mouseClickDelta + telemetry.mouseMoveDelta;
    emitDiag("telemetry_tick", {
      appName: telemetry.appName,
      processName: telemetry.processName,
      windowTitle: telemetry.windowTitle,
      domain: telemetry.domain,
      windowSignature: signature,
      idleSec: telemetry.idleSec,
      keyboardDelta: telemetry.keyboardDelta,
      mouseClickDelta: telemetry.mouseClickDelta,
      mouseMoveDelta: telemetry.mouseMoveDelta,
      inputDelta,
      inputActive: inputDelta > 0,
    });
  }
  state.lastIdleSec = telemetry.idleSec;
  state.keyboardCount += telemetry.keyboardDelta;
  state.mouseCount += telemetry.mouseClickDelta;
  state.mouseMoveCount += telemetry.mouseMoveDelta;

  if (!state.currentWindow) {
    state.currentWindow = telemetry;
    state.windowStartedAtMs = now;
  } else {
    const changed = windowSignature(telemetry) !== windowSignature(state.currentWindow);
    if (changed) {
      await flushWindowEvent(true);
      state.currentWindow = telemetry;
      state.windowStartedAtMs = now;
    }
  }

  await maybeSendAfkEvent(telemetry.idleSec);

  if ((now - state.lastHeartbeatAtMs) / 1000 >= heartbeatIntervalSec()) {
    await sendHeartbeat(telemetry.idleSec);
    state.lastHeartbeatAtMs = now;
  }
}

function scheduleRetryFlush() {
  const ms = RETRY_INTERVAL_SEC * 1000;
  setTimeout(() => {
    flushCachedQueue().catch((err) => {
      emitDiag("retry_error", { error: String(err?.message || err) });
    });
    scheduleRetryFlush();
  }, ms);
}

function scheduleInputFlush() {
  const ms = inputFlushIntervalSec() * 1000;
  setTimeout(() => {
    flushInputStats().catch((err) => {
      console.error("flushInputStats error", err.message);
    });
    scheduleInputFlush();
  }, ms);
}

function scheduleWindowFlush() {
  const ms = windowFlushIntervalSec() * 1000;
  setTimeout(() => {
    flushWindowEvent().catch((err) => {
      console.error("flushWindowEvent error", err.message);
    });
    scheduleWindowFlush();
  }, ms);
}

function startTelemetryStream() {
  const scriptPath = path.join(__dirname, "windows-telemetry.ps1");
  const child = spawn("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
  ], { stdio: ["ignore", "pipe", "pipe"] });

  child.stderr.on("data", (chunk) => {
    emitDiag("telemetry_stderr", { message: String(chunk) });
    console.error("telemetry stderr", String(chunk));
  });

  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    const payload = parseJsonLine(line);
    handleTelemetry(payload).catch((err) => {
      console.error("handleTelemetry error", err.message);
    });
  });

  child.on("exit", (code) => {
    emitDiag("telemetry_exit", { code });
    console.error(`telemetry process exited with code ${code}`);
    setTimeout(startTelemetryStream, 2000);
  });

  emitDiag("telemetry_started");
}

async function main() {
  emitDiag("agent_started", {
    apiBaseUrl: API_BASE_URL,
    hasToken: Boolean(TOKEN),
    companyId: COMPANY_ID,
    employeeId: EMPLOYEE_ID,
  });

  console.log("Activity agent started", {
    API_BASE_URL,
    HEARTBEAT_ACTIVE_SEC,
    HEARTBEAT_IDLE_SEC,
    INPUT_FLUSH_ACTIVE_SEC,
    INPUT_FLUSH_IDLE_SEC,
    WINDOW_FLUSH_ACTIVE_SEC,
    WINDOW_FLUSH_IDLE_SEC,
    AFK_THRESHOLD_SEC,
    JPEG_QUALITY,
    CACHE_DIR,
    RETRY_INTERVAL_SEC,
    RETRY_BATCH_SIZE,
  });

  startTelemetryStream();

  scheduleInputFlush();
  scheduleWindowFlush();
  scheduleRetryFlush();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
