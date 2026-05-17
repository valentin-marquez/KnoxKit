#Requires -Version 5.1
<#
.SYNOPSIS
    One-shot, idempotent dev-environment bootstrap for KnoxKit v2 on Windows 10/11.

.DESCRIPTION
    Detects and installs the toolchain KnoxKit needs:
      - rustup (then sets the MSVC stable toolchain as default)
      - Bun (the ONLY JavaScript runtime — Node.js is intentionally NOT installed)
      - just (task runner)
      - mise (toolchain version pinning)
    Then provisions the pinned versions via `mise install`.

    Visual Studio Build Tools are NOT auto-installed (multi-GB download). The
    script detects them and prints a manual instruction if absent, but does not
    hard-fail. WebView2 is detected on Windows 10 and installed via the official
    Evergreen bootstrapper if missing; on Windows 11 it is preinstalled and
    skipped.

    The script is safe to re-run: every tool is detect-then-skip.

.NOTES
    Windows 10 / Windows 11 ONLY. Linux and macOS are out of scope for this
    bootstrap (see docs/future.md).
#>

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # speeds up Invoke-WebRequest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "    [ok] $Message" -ForegroundColor Green
}

function Write-Skip {
    param([string]$Message)
    Write-Host "    [skip] $Message" -ForegroundColor DarkGray
}

function Write-Warn {
    param([string]$Message)
    Write-Host "    [warn] $Message" -ForegroundColor Yellow
}

function Test-CommandExists {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Winget {
    param(
        [string]$PackageId,
        [string]$FriendlyName
    )
    if (-not (Test-CommandExists 'winget')) {
        throw "winget is not available. Install 'App Installer' from the Microsoft Store, then re-run this script."
    }
    Write-Host "    installing $FriendlyName ($PackageId) via winget..." -ForegroundColor White
    # --disable-interactivity keeps winget non-interactive; the agreement flags
    # avoid the first-run source/license prompts that would otherwise block.
    winget install --id $PackageId --exact --silent `
        --accept-source-agreements --accept-package-agreements `
        --disable-interactivity
    $code = $LASTEXITCODE
    # winget exit 0 = installed; -1978335189 (0x8A15002B) = "no applicable
    # upgrade / already installed" which we treat as success on a re-run.
    if ($code -ne 0 -and $code -ne -1978335189) {
        throw "winget failed to install $FriendlyName (exit $code)."
    }
    Write-Ok "$FriendlyName present"
}

function Update-SessionPath {
    # winget-installed shims usually land in the per-user WinGet Links dir and
    # in tool-specific dirs. Refresh the in-process PATH from the registry so
    # detection of just-installed tools works without a new shell.
    $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $extra = @(
        (Join-Path $env:USERPROFILE '.cargo\bin'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links'),
        (Join-Path $env:USERPROFILE '.bun\bin'),
        (Join-Path $env:LOCALAPPDATA 'mise\bin')
    )
    $env:Path = (@($machine, $user) + $extra | Where-Object { $_ }) -join ';'
}

# ---------------------------------------------------------------------------
# 0. OS gate — Windows 10 or 11 only
# ---------------------------------------------------------------------------

function Assert-SupportedWindows {
    Write-Step "Verifying operating system"
    $caption = (Get-CimInstance Win32_OperatingSystem).Caption
    if ($caption -match 'Windows 10' -or $caption -match 'Windows 11') {
        Write-Ok "$caption"
        return
    }
    Write-Host ""
    Write-Host "ERROR: KnoxKit v2's dev environment supports Windows 10 and Windows 11 only." -ForegroundColor Red
    Write-Host "       Detected: '$caption'." -ForegroundColor Red
    Write-Host "       Linux and macOS are deferred — see docs/future.md." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# Tool installers (each detect-then-skip)
# ---------------------------------------------------------------------------

function Install-Rustup {
    Write-Step "Rust toolchain (rustup)"
    if (Test-CommandExists 'rustup') {
        Write-Skip "rustup already installed"
    }
    else {
        Invoke-Winget -PackageId 'Rustlang.Rustup' -FriendlyName 'rustup'
        Update-SessionPath
    }
    if (Test-CommandExists 'rustup') {
        Write-Host "    setting default toolchain to stable-x86_64-pc-windows-msvc..." -ForegroundColor White
        rustup default stable-x86_64-pc-windows-msvc
        Write-Ok "Rust default toolchain = stable-x86_64-pc-windows-msvc"
    }
    else {
        Write-Warn "rustup not on PATH yet — open a NEW shell and run: rustup default stable-x86_64-pc-windows-msvc"
    }
}

function Install-Bun {
    Write-Step "Bun (the only JS runtime — Node.js is NOT installed by design)"
    if (Test-CommandExists 'bun') {
        Write-Skip "bun already installed ($(bun --version))"
        return
    }
    Invoke-Winget -PackageId 'Oven-sh.Bun' -FriendlyName 'Bun'
    Update-SessionPath
}

function Install-Just {
    Write-Step "just (task runner)"
    if (Test-CommandExists 'just') {
        Write-Skip "just already installed ($(just --version))"
        return
    }
    Invoke-Winget -PackageId 'Casey.Just' -FriendlyName 'just'
    Update-SessionPath
}

function Install-Mise {
    Write-Step "mise (toolchain version manager)"
    if (Test-CommandExists 'mise') {
        Write-Skip "mise already installed ($(mise --version))"
        return
    }
    Invoke-Winget -PackageId 'jdx.mise' -FriendlyName 'mise'
    Update-SessionPath
}

function Test-VisualStudioBuildTools {
    Write-Step "Visual Studio C++ Build Tools (MSVC linker)"

    # 1. cl.exe already reachable?
    if (Test-CommandExists 'cl') {
        Write-Ok "cl.exe found on PATH"
        return
    }

    # 2. Ask vswhere (shipped with any VS 2017+ install) for a VC++ toolset.
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (Test-Path $vswhere) {
        $vsPath = & $vswhere -latest -products * `
            -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
            -property installationPath 2>$null
        if ($vsPath) {
            Write-Ok "VC++ build tools detected at: $vsPath"
            return
        }
    }

    Write-Warn 'Visual Studio C++ Build Tools were NOT detected.'
    Write-Host '    Rust on Windows needs the MSVC linker. Install it manually (multi-GB,' -ForegroundColor Yellow
    Write-Host '    so this script will NOT auto-download it):' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '      winget install --id Microsoft.VisualStudio.2022.BuildTools --exact' -ForegroundColor White
    Write-Host '        --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"' -ForegroundColor White
    Write-Host ''
    Write-Host '    (Or run the Visual Studio Installer and select the' -ForegroundColor Yellow
    Write-Host "     'Desktop development with C++' workload.)" -ForegroundColor Yellow
    Write-Host '    Continuing -- cargo build will fail until this is installed.' -ForegroundColor Yellow
}

function Install-WebView2 {
    Write-Step "WebView2 Runtime"

    $caption = (Get-CimInstance Win32_OperatingSystem).Caption
    if ($caption -match 'Windows 11') {
        Write-Skip "Windows 11 — WebView2 ships with the OS"
        return
    }

    # Evergreen WebView2 registers under this product GUID. Check both the
    # machine-wide (WOW6432Node) and per-user hives.
    $clientGuid = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    $machineKey = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$clientGuid"
    $userKey = "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$clientGuid"

    $found = $false
    foreach ($key in @($machineKey, $userKey)) {
        if (Test-Path $key) {
            $pv = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).pv
            if ($pv -and $pv -ne '0.0.0.0') {
                $found = $true
                Write-Ok "WebView2 Runtime present (version $pv)"
                break
            }
        }
    }
    if ($found) { return }

    Write-Host "    WebView2 Runtime missing on Windows 10 — installing Evergreen bootstrapper..." -ForegroundColor White
    $bootstrapper = Join-Path $env:TEMP 'MicrosoftEdgeWebview2Setup.exe'
    # Official Microsoft Evergreen bootstrapper fwlink.
    Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' `
        -OutFile $bootstrapper -UseBasicParsing
    # /silent /install = unattended Evergreen install.
    $proc = Start-Process -FilePath $bootstrapper -ArgumentList '/silent', '/install' -Wait -PassThru
    Remove-Item $bootstrapper -ErrorAction SilentlyContinue
    if ($proc.ExitCode -eq 0) {
        Write-Ok "WebView2 Runtime installed"
    }
    else {
        Write-Warn "WebView2 bootstrapper exited with code $($proc.ExitCode) -- verify manually if 'bun run tauri dev' fails to open a window."
    }
}

function Invoke-MiseInstall {
    Write-Step "Provisioning pinned toolchains (mise install)"
    if (-not (Test-CommandExists 'mise')) {
        Write-Warn "mise not on PATH in this shell — open a NEW terminal and run: mise install"
        return
    }
    Push-Location (Split-Path $PSScriptRoot -Parent)
    try {
        mise install
        Write-Ok "Pinned Rust + Bun versions provisioned (see mise.toml)"
    }
    finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

Write-Host "KnoxKit v2 — Windows dev environment setup" -ForegroundColor Magenta
Write-Host "(idempotent: safe to run again any time)" -ForegroundColor DarkGray

Assert-SupportedWindows
Update-SessionPath

Install-Rustup
Install-Bun
Install-Just
Install-Mise
Test-VisualStudioBuildTools
Install-WebView2
Invoke-MiseInstall

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host " Setup complete." -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host " IMPORTANT: winget puts new tool shims in a Links directory that" -ForegroundColor Yellow
Write-Host " an already-open shell will NOT see. If 'bun', 'just' or 'mise'" -ForegroundColor Yellow
Write-Host " are reported 'not found', open a NEW PowerShell window." -ForegroundColor Yellow
Write-Host ""
Write-Host " Next steps:" -ForegroundColor Cyan
Write-Host "   1. bun install               # install JS dependencies" -ForegroundColor White
Write-Host "   2. just steamcmd-install     # one-time: fetch SteamCMD into tools/" -ForegroundColor White
Write-Host "   3. just dev                  # run the app" -ForegroundColor White
Write-Host ""
