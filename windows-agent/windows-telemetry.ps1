Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class Win32Telemetry {
    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    [DllImport("kernel32.dll")]
    public static extern uint GetTickCount();

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT point);
}
"@

$ErrorActionPreference = 'Stop'

$keyState = @{}
for ($vk = 8; $vk -le 254; $vk++) {
  $keyState[$vk] = $false
}

$mouseButtons = @(1, 2, 4, 5)
$mouseButtonState = @{}
foreach ($btn in $mouseButtons) {
  $mouseButtonState[$btn] = $false
}

$lastX = 0
$lastY = 0
$cursorInit = $false

while ($true) {
  $keyboardDelta = 0
  $mouseClickDelta = 0
  $mouseMoveDelta = 0

  $hWnd = [Win32Telemetry]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 1024
  [void][Win32Telemetry]::GetWindowText($hWnd, $sb, $sb.Capacity)
  $windowTitle = $sb.ToString()

  $processId = 0
  [void][Win32Telemetry]::GetWindowThreadProcessId($hWnd, [ref]$processId)

  $processName = ''
  $appName = ''
  if ($processId -gt 0) {
    try {
      $p = Get-Process -Id $processId -ErrorAction Stop
      $processName = $p.ProcessName
      $appName = if ($p.MainWindowTitle) { $p.MainWindowTitle } else { $p.ProcessName }
    } catch {
      $processName = ''
      $appName = ''
    }
  }

  $url = $null
  $domain = $null
  if ($windowTitle -match '(https?://[^\s]+)') {
    $url = $Matches[1]
    try {
      $domain = ([Uri]$url).Host
    } catch {
      $domain = $null
    }
  }

  $lii = New-Object Win32Telemetry+LASTINPUTINFO
  $lii.cbSize = [Runtime.InteropServices.Marshal]::SizeOf([type][Win32Telemetry+LASTINPUTINFO])
  [void][Win32Telemetry]::GetLastInputInfo([ref]$lii)
  $tickNow = [Win32Telemetry]::GetTickCount()
  $idleMs = [math]::Max(0, [int64]$tickNow - [int64]$lii.dwTime)
  $idleSec = [int][math]::Floor($idleMs / 1000)

  for ($vk = 8; $vk -le 254; $vk++) {
    if ($mouseButtons -contains $vk) { continue }

    $isDown = (([Win32Telemetry]::GetAsyncKeyState($vk) -band 0x8000) -ne 0)
    $prevDown = [bool]$keyState[$vk]
    if ($isDown -and -not $prevDown) {
      $keyboardDelta++
    }
    $keyState[$vk] = $isDown
  }

  foreach ($btn in $mouseButtons) {
    $isDown = (([Win32Telemetry]::GetAsyncKeyState($btn) -band 0x8000) -ne 0)
    $prevDown = [bool]$mouseButtonState[$btn]
    if ($isDown -and -not $prevDown) {
      $mouseClickDelta++
    }
    $mouseButtonState[$btn] = $isDown
  }

  $pt = New-Object Win32Telemetry+POINT
  if ([Win32Telemetry]::GetCursorPos([ref]$pt)) {
    if ($cursorInit) {
      if ($pt.X -ne $lastX -or $pt.Y -ne $lastY) {
        $mouseMoveDelta = 1
      }
    } else {
      $cursorInit = $true
    }

    $lastX = $pt.X
    $lastY = $pt.Y
  }

  $obj = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    appName = $appName
    windowTitle = $windowTitle
    processName = $processName
    url = $url
    domain = $domain
    idleSec = $idleSec
    keyboardDelta = $keyboardDelta
    mouseClickDelta = $mouseClickDelta
    mouseMoveDelta = $mouseMoveDelta
  }

  $obj | ConvertTo-Json -Compress
  Start-Sleep -Milliseconds 1000
}
