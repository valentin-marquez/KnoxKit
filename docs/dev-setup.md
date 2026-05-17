# KnoxKit v2 — Dev Setup

> **Windows 10 / Windows 11 only.** Linux and macOS are deliberately
> deferred for this bootstrap — see `docs/future.md`. The setup script will
> refuse to run on anything else.

## TL;DR

```powershell
# 1. Bootstrap the toolchain (run once; as Administrator if you want it to
#    walk you through Visual Studio Build Tools — see note below).
pwsh scripts/setup-windows.ps1

# 2. Provision pinned tool versions (Rust 1.95.0, Bun 1.3.7).
mise install

# 3. Install JS dependencies.
bun install

# 4. One-time: download SteamCMD into tools/.
just steamcmd-install

# 5. Run the app.
just dev
```

> After step 1, **open a new PowerShell window** before steps 2–5. winget
> drops new tool shims into a Links directory an already-open shell does
> not see.

## Step-by-step

### 1. `scripts/setup-windows.ps1` (once)

```powershell
pwsh scripts/setup-windows.ps1
```

What it does (idempotent — safe to re-run):

- Verifies the OS is Windows 10 or 11; exits with a clear error otherwise.
- Detects-then-installs via winget: **rustup** (and sets the
  `stable-x86_64-pc-windows-msvc` default), **Bun**, **just**, **mise**.
- **Visual Studio C++ Build Tools**: detected but **not** auto-installed
  (multi-GB). If missing, the script prints the exact winget command and
  continues. Rust on Windows needs the MSVC linker — `cargo build` will
  fail until this is installed. Run that step yourself, ideally in an
  **elevated** shell:

  ```powershell
  winget install --id Microsoft.VisualStudio.2022.BuildTools --exact `
    --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  ```

- **WebView2 runtime**: on Windows 11 it ships with the OS (skipped); on
  Windows 10 the script detects it via the registry and installs the
  official Evergreen bootstrapper if absent. Without it the Tauri window
  will not render.
- Runs `mise install` to provision pinned versions.

### 2. `mise install`

Already run by the setup script, but run it again any time `mise.toml`
changes. Pins **Rust 1.95.0** and **Bun 1.3.7**. No Node — by design.

### 3. `bun install`

Installs JS dependencies from `bun.lock` (text lockfile). Use `bun
install --frozen-lockfile` to assert the lockfile is authoritative (CI
does this).

### 4. `just steamcmd-install` (one-time)

Runs `scripts/install-steamcmd.ps1`: downloads SteamCMD from Valve into
`tools/steamcmd/` and bootstraps it. `tools/` is git-ignored. SteamCMD's
first run self-updates and may exit nonzero — that is expected and the
script handles it.

> `cargo test` never touches SteamCMD. The worker test suite uses a
> `MockProcess`. SteamCMD is only needed at runtime / manual integration.

### 5. `just dev`

Runs the Tauri app in dev mode (`bun run tauri dev`). For a one-command
"ensure deps then run", use `pwsh scripts/dev.ps1` instead — it runs
`bun install` / `cargo fetch` only if needed, then `just dev`.

## Why Bun, not Node / pnpm?

This is a deliberate, locked decision:

- **One single binary.** Bun is runtime + package manager + test runner +
  TS executor in one. No Node + corepack + pnpm + ts-node stack to keep
  aligned across machines.
- **No corepack dance.** Nothing to `corepack enable`, no
  `packageManager` mismatch warnings.
- **Native TypeScript.** Bun runs `.ts` directly — config and scripts stay
  TS without a build step.
- **Text lockfile.** `bun.lock` is a readable, diffable text file (unlike
  a binary lockfile), so dependency changes are reviewable in PRs.

**Documented fallback:** if some niche Vite plugin genuinely breaks under
Bun, the escape hatch is to add Node *for that one tool only*:

```toml
# mise.toml
[tools]
node = "22"   # LTS — added ONLY because <plugin X> needs it
```

Bun stays the package manager and primary runtime. We do not migrate the
whole toolchain back to Node — this is a surgical, documented exception,
not a reversal.

## Multi-machine note

The `mise.toml` + `justfile` pair is the entire reproducibility story:
clone the repo, run `scripts/setup-windows.ps1`, and a home machine and an
office machine end up byte-identical in tool versions — **no Docker
required**. KnoxKit is a native Windows app; there is no container layer.
