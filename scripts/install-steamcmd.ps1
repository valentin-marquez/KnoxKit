#Requires -Version 5.1
<#
.SYNOPSIS
    Idempotently install Valve's SteamCMD into tools/steamcmd/.

.DESCRIPTION
    Downloads the official SteamCMD zip from Valve, extracts it into
    tools/steamcmd/, and runs it once with `+quit` so it can self-update
    and lay down its runtime files.

    Re-running is a no-op once tools/steamcmd/steamcmd.exe exists.

.NOTES
    `cargo test` NEVER invokes this script. The SteamCMD worker test suite
    uses a MockProcess and never spawns a real steamcmd binary (see
    docs/architecture.md / docs/steamcmd-protocol.md). SteamCMD is only
    needed at runtime and for manual integration testing.

    tools/ is git-ignored (handled in .gitignore by Agent A).
#>

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

# Repo root = parent of the scripts/ directory this file lives in.
$RepoRoot = Split-Path $PSScriptRoot -Parent
$SteamDir = Join-Path $RepoRoot 'tools\steamcmd'
$SteamExe = Join-Path $SteamDir 'steamcmd.exe'
$ZipUrl = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip'

Write-Host "KnoxKit v2 — SteamCMD installer" -ForegroundColor Magenta
Write-Host "(idempotent: skips download if already present)" -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
# 1. Short-circuit if already installed
# ---------------------------------------------------------------------------
if (Test-Path $SteamExe) {
    Write-Host ""
    Write-Host "[skip] SteamCMD already present at: $SteamExe" -ForegroundColor DarkGray
    Write-Host "       Delete tools/steamcmd/ and re-run to force a fresh install." -ForegroundColor DarkGray
    exit 0
}

# ---------------------------------------------------------------------------
# 2. Download + extract
# ---------------------------------------------------------------------------
Write-Step "Creating tools/steamcmd/"
New-Item -ItemType Directory -Path $SteamDir -Force | Out-Null

$ZipPath = Join-Path $SteamDir 'steamcmd.zip'

Write-Step "Downloading SteamCMD from Valve"
Write-Host "    $ZipUrl" -ForegroundColor White
Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing
Write-Host "    [ok] downloaded $([math]::Round((Get-Item $ZipPath).Length / 1KB)) KB" -ForegroundColor Green

Write-Step "Extracting steamcmd.zip"
Expand-Archive -Path $ZipPath -DestinationPath $SteamDir -Force
Remove-Item $ZipPath -ErrorAction SilentlyContinue

if (-not (Test-Path $SteamExe)) {
    Write-Host ""
    Write-Host "ERROR: steamcmd.exe not found after extraction. The download may be" -ForegroundColor Red
    Write-Host "       corrupt. Delete tools/steamcmd/ and re-run." -ForegroundColor Red
    exit 1
}
Write-Host "    [ok] extracted to $SteamDir" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 3. Bootstrap / self-update
# ---------------------------------------------------------------------------
Write-Step "Bootstrapping SteamCMD (self-update — this can take a minute)"
Write-Host "    running: steamcmd.exe +quit" -ForegroundColor White

# SteamCMD's first run downloads its own update package and then frequently
# RESTARTS itself; the initial process commonly exits with a NON-ZERO code
# (e.g. 7) even though the bootstrap succeeded. So we do not hard-fail on a
# nonzero exit here — we verify success by re-checking that the binary still
# exists and that the steamcmd runtime data was laid down.
$proc = Start-Process -FilePath $SteamExe -ArgumentList '+quit' -Wait -PassThru -NoNewWindow
Write-Host "    steamcmd.exe exited with code $($proc.ExitCode) (nonzero is normal on first bootstrap)" -ForegroundColor DarkGray

if (-not (Test-Path $SteamExe)) {
    Write-Host ""
    Write-Host "ERROR: steamcmd.exe disappeared after bootstrap. Installation failed." -ForegroundColor Red
    exit 1
}

# The 'package' subdir (or steamerrorreporter / a sizable steamcmd.exe) is
# strong evidence the self-update actually ran.
$bootstrapped = (Test-Path (Join-Path $SteamDir 'package')) -or `
    (Test-Path (Join-Path $SteamDir 'steamerrorreporter.exe'))
if ($bootstrapped) {
    Write-Host "    [ok] SteamCMD self-update completed" -ForegroundColor Green
}
else {
    Write-Host "    [warn] could not confirm self-update artifacts, but steamcmd.exe exists." -ForegroundColor Yellow
    Write-Host "           It will finish updating on first real use." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host " SteamCMD ready at: $SteamExe" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""
