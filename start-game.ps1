$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5173
$url = "http://127.0.0.1:$port"
$serverScript = Join-Path $projectRoot 'dev-server.mjs'
$outputLog = Join-Path $projectRoot 'game-server.log'
$errorLog = Join-Path $projectRoot 'game-server-error.log'

function Test-GameServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri $url
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-GameServer)) {
  $nodePath = (Get-Command node -ErrorAction Stop).Source
  $serverProcess = Start-Process `
    -FilePath $nodePath `
    -ArgumentList $serverScript `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outputLog `
    -RedirectStandardError $errorLog `
    -PassThru

  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    Start-Sleep -Milliseconds 200
    if (Test-GameServer) {
      $ready = $true
      break
    }
    if ($serverProcess.HasExited) { break }
  }

  if (-not $ready) {
    $details = if (Test-Path $errorLog) { Get-Content -Raw $errorLog } else { 'No error log was produced.' }
    throw "The game server did not start.`n$details"
  }
}

Start-Process $url
