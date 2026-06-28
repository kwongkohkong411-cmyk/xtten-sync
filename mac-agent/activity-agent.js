/*
  Activity Agent v1 (macOS scaffold)
  - Collect active window/app usage + idle + input stats
  - Capture screenshot every N minutes (1/3/5)
  - Upload as activity ingest events

  This file is a starter scaffold. Integrate real collectors via AppleScript / Swift bridge
  or trusted native modules for production usage.
*/

const API_BASE_URL = process.env.ACTIVITY_API_BASE_URL || "http://localhost:3000";
const TOKEN = process.env.ACTIVITY_AGENT_TOKEN || "";
const COMPANY_ID = process.env.ACTIVITY_COMPANY_ID || "";
const EMPLOYEE_ID = process.env.ACTIVITY_EMPLOYEE_ID || "";
const SCREENSHOT_INTERVAL_MIN = Number(process.env.SCREENSHOT_INTERVAL_MIN || 3);

if (![1, 3, 5].includes(SCREENSHOT_INTERVAL_MIN)) {
  throw new Error("SCREENSHOT_INTERVAL_MIN must be one of 1, 3, 5");
}

async function post(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}${COMPANY_ID ? `?companyId=${encodeURIComponent(COMPANY_ID)}` : ""}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }

  return res.json();
}

async function collectActiveWindow() {
  // TODO: replace with real macOS active-window collector.
  return {
    employeeId: EMPLOYEE_ID,
    appName: "UnknownApp",
    windowTitle: "UnknownWindow",
    processName: "unknown",
    durationSec: 10,
    capturedAt: new Date().toISOString(),
    metadata: { platform: "mac", source: "agent-scaffold" },
  };
}

async function collectIdleAndInputStats() {
  // TODO: replace with real idle + keyboard/mouse counters.
  return {
    employeeId: EMPLOYEE_ID,
    idleSec: 0,
    keyboardCount: 0,
    mouseCount: 0,
    capturedAt: new Date().toISOString(),
    metadata: { platform: "mac", source: "agent-scaffold" },
  };
}

async function collectScreenshotPayload() {
  // TODO: replace with real screenshot capture; can send screenshotUrl or screenshotBase64.
  return {
    employeeId: EMPLOYEE_ID,
    screenshotUrl: null,
    screenshotBase64: null,
    capturedAt: new Date().toISOString(),
    metadata: { platform: "mac", source: "agent-scaffold" },
  };
}

async function pushRealtimeSignals() {
  const [windowEvent, inputStats] = await Promise.all([
    collectActiveWindow(),
    collectIdleAndInputStats(),
  ]);

  await post("/activity/ingest/window-event", windowEvent);
  await post("/activity/ingest/idle-event", {
    employeeId: inputStats.employeeId,
    idleSec: inputStats.idleSec,
    capturedAt: inputStats.capturedAt,
    metadata: inputStats.metadata,
  });
  await post("/activity/ingest/input-stats", inputStats);
}

async function pushScreenshotSignal() {
  const screenshot = await collectScreenshotPayload();
  await post("/activity/ingest/screenshot", screenshot);
}

async function main() {
  console.log("Activity agent started", { API_BASE_URL, SCREENSHOT_INTERVAL_MIN });

  setInterval(() => {
    pushRealtimeSignals().catch((err) => {
      console.error("pushRealtimeSignals error", err.message);
    });
  }, 10 * 1000);

  setInterval(() => {
    pushScreenshotSignal().catch((err) => {
      console.error("pushScreenshotSignal error", err.message);
    });
  }, SCREENSHOT_INTERVAL_MIN * 60 * 1000);

  await pushRealtimeSignals();
  await pushScreenshotSignal();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
