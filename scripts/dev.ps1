#Requires -Version 5.1
<#
.SYNOPSIS
    Fast, idempotent "just start the app" wrapper.

.DESCRIPTION
    Ensures JS and Rust dependencies are fetched exactly once, then hands off
    to `just dev`. Re-running when deps are already present is near-instant —
    the dependency steps are skipped via cheap existence checks.

    Equivalent manual steps:
        bun install                                   (if node_modules missing)
        cargo fetch --manifest-path src-tauri/Cargo.toml   (if not yet fetched)
        just dev
#>

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

$RepoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $RepoRoot
try {
    # -----------------------------------------------------------------------
    # 1. JS dependencies (Bun) — install only if node_modules is absent.
    # -----------------------------------------------------------------------
    if (Test-Path (Join-Path $RepoRoot 'node_modules')) {
        Write-Host "[skip] node_modules present — not running bun install" -ForegroundColor DarkGray
    }
    else {
        Write-Step "Installing JS dependencies (bun install)"
        bun install
    }

    # -----------------------------------------------------------------------
    # 2. Rust dependencies — fetch once. We use a sentinel marker so repeat
    #    runs stay fast (cargo fetch is cheap when warm, but skipping is
    #    cheaper). Delete .knoxkit-cargo-fetched to force a re-fetch.
    # -----------------------------------------------------------------------
    $manifest = Join-Path $RepoRoot 'src-tauri\Cargo.toml'
    $fetchMarker = Join-Path $RepoRoot 'src-tauri\.knoxkit-cargo-fetched'
    if (Test-Path $fetchMarker) {
        Write-Host "[skip] cargo dependencies already fetched" -ForegroundColor DarkGray
    }
    else {
        Write-Step "Fetching Rust dependencies (cargo fetch)"
        cargo fetch --manifest-path $manifest
        New-Item -ItemType File -Path $fetchMarker -Force | Out-Null
    }

    # -----------------------------------------------------------------------
    # 3. Hand off to the canonical dev recipe.
    # -----------------------------------------------------------------------
    Write-Step "Starting KnoxKit (just dev)"
    just dev
}
finally {
    Pop-Location
}
