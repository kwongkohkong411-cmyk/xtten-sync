# XTTEN Desktop Agent (Windows MVP)

## Features

- Employee account login and automatic binding to company/user.
- Persisted token and runtime binding in app data.
- Start/stop telemetry collector.
- Screenshot capture uses Electron `desktopCapturer` (no PowerShell screenshot script).
- Tray background mode.
- Launch at startup toggle.
- Packaging targets: EXE and MSI.

## Development

1. Install dependencies

npm install

2. Run desktop app

npm run dev

## Build installers (Windows)

npm run pack:win

Output artifacts are generated in:

windows-agent/desktop-agent/dist

## API configuration (for employees)

Set fixed API endpoint in:

windows-agent/desktop-agent/config.json

Example:

{
	"api": "https://api.xtten.com",
	"lockApiBaseUrl": true
}

With `lockApiBaseUrl: true`, employees cannot edit API base URL in UI.

## Offline cache and retry (Windows MVP+)

When network/API is unavailable, agent now caches ingest events locally and retries automatically.

- Cache directory: `%USERPROFILE%/.xtten-agent-cache`
- Screenshot cache directory: `%APPDATA%/xtten-desktop-agent/screenshot-queue`
- Retry scheduler: exponential backoff (default every 15s tick)
- Channels covered: heartbeat, window-event, input-stats, idle-event, screenshot

Tunable environment variables:

- `RETRY_INTERVAL_SEC` (default `15`)
- `RETRY_MAX_BACKOFF_SEC` (default `300`)
- `RETRY_BATCH_SIZE` (default `25`)
- `ACTIVITY_CACHE_DIR` (optional custom cache path)

## Auto update (Windows)

Desktop app checks backend release endpoint periodically and can auto-download installer:

- Endpoint: `/agent/releases`
- Artifact used: Windows `exe`
- Download endpoint: `/agent/download/windows?format=exe`

Environment variable:

- `UPDATE_CHECK_INTERVAL_MIN` (default `30`)

UI actions:

- Check for Updates
- Install Downloaded Update

## Backend release API mapping

Expected artifact names:

- xtten-agent-setup.exe
- xtten-agent-setup.msi

You can override names and directory from backend env:

- AGENT_RELEASES_DIR
- AGENT_WINDOWS_EXE_NAME
- AGENT_WINDOWS_MSI_NAME
