param(
  [switch]$Configure,
  [switch]$Yes
)

# Usage: .\start-all.ps1 [-Configure] [-Yes]
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is required. Install Node.js 22 or newer, then run this script again."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm is required. Install Node.js with npm, then run this script again."
}

$ArgsList = @()
if ($Configure) {
  $ArgsList += "--configure"
}
if ($Yes) {
  $ArgsList += "--yes"
}

node "scripts/start-all.mjs" @ArgsList
