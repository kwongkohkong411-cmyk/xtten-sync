$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3000'
$results = @()

function Add-Result($name, $status) {
  $script:results += "$name -> $status"
}

function Invoke-Step($name, [scriptblock]$action) {
  try {
    & $action | Out-Null
    Add-Result $name '200/201'
  }
  catch {
    if ($_.Exception.Response) {
      Add-Result $name ([string][int]$_.Exception.Response.StatusCode.value__)
    }
    else {
      Add-Result $name ("ERR " + $_.Exception.Message)
    }
  }
}

$loginBody = @{ account = 'sn888xt'; password = 'Admin@123456' } | ConvertTo-Json
$login = $null
try {
  $login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body $loginBody
  Add-Result 'POST /auth/login' '201'
}
catch {
  if ($_.Exception.Response) {
    Add-Result 'POST /auth/login' ([string][int]$_.Exception.Response.StatusCode.value__)
  }
  else {
    Add-Result 'POST /auth/login' ("ERR " + $_.Exception.Message)
  }
}

if ($login -and $login.access_token) {
  $token = $login.access_token
  $companyId = $login.user.companyId
  $employeeId = $login.user.employeeId
  $headers = @{ Authorization = "Bearer $token" }

  Invoke-Step 'GET /auth/me' { Invoke-RestMethod -Method Get -Uri "$base/auth/me" -Headers $headers }
  Invoke-Step 'GET /users' { Invoke-RestMethod -Method Get -Uri "$base/users" -Headers $headers }

  $newCode = 'SMK' + (Get-Date -Format 'yyyyMMddHHmmss')
  $companyBody = @{ name = 'Smoke Company'; code = $newCode; timezone = 'Asia/Shanghai' } | ConvertTo-Json
  Invoke-Step 'POST /companies' { Invoke-RestMethod -Method Post -Uri "$base/companies" -Headers $headers -ContentType 'application/json' -Body $companyBody }

  Invoke-Step 'GET /employees' { Invoke-RestMethod -Method Get -Uri "$base/employees" -Headers $headers }
  Invoke-Step 'GET /attendance/events' { Invoke-RestMethod -Method Get -Uri "$base/attendance/events" -Headers $headers }
  Invoke-Step 'GET /activity/live' { Invoke-RestMethod -Method Get -Uri "$base/activity/live?companyId=$companyId&limit=1" -Headers $headers }

  $shotBody = @{
    employeeId = $employeeId
    capturedAt = (Get-Date).ToString('o')
    imageBase64 = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4ICAAAADQAwCdASoIAAIAAkA4JaQAA3AA/v89WAAAAA=='
    appName = 'Smoke'
    windowTitle = 'Smoke'
    keyboardCount = 0
    mouseCount = 0
    idleSec = 0
    captureSource = 'MANUAL'
    perceptualHash = '0000000000000000'
  } | ConvertTo-Json -Depth 6
  Invoke-Step 'POST /activity/screenshots' { Invoke-RestMethod -Method Post -Uri "$base/activity/screenshots?companyId=$companyId" -Headers $headers -ContentType 'application/json' -Body $shotBody }
}

$results -join "`n"
