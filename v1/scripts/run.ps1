param(
  [string]$Url = "https://coinclass.com/",
  [string]$OutDir = "",
  [string]$ProfileDir = "",
  [string]$Script = "coinclass_capture.mjs",
  [string]$Channel = "msedge",
  [string]$Task = "",
  [int]$WaitMs = 120000,
  [switch]$NoManual,
  [switch]$KeepOpen
)

$ErrorActionPreference = "Stop"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if ([string]::IsNullOrWhiteSpace($OutDir)) { $OutDir = Join-Path $root "data\blave" }
if ([string]::IsNullOrWhiteSpace($ProfileDir)) { $ProfileDir = Join-Path $root ".profile" }

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null

if (!(Test-Path (Join-Path $root "node_modules"))) {
  $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
  Push-Location $root
  try {
    npm install
  } finally {
    Pop-Location
  }
}

$argsList = @("--outDir", $OutDir, "--profileDir", $ProfileDir, "--channel", $Channel)

if (![string]::IsNullOrWhiteSpace($Task)) {
  $argsList += @("--task", $Task)
} else {
  $argsList += @("--url", $Url)
}

if ($NoManual) { $argsList += @("--noManual", "--waitMs", "$WaitMs") }
if ($KeepOpen) { $argsList += "--keepOpen" }

Push-Location $root
try {
  node (Join-Path $root $Script) @argsList
} finally {
  Pop-Location
}
