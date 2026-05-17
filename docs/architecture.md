# KnoxKit v2 — Architecture

> Written for future-Valentín six months from now. Read this before changing
> anything structural. Every rule here is a reaction to a concrete v1
> failure — `docs/v1-postmortem.md` has the brutal version.

KnoxKit is a Project Zomboid (PZ) **instance manager** and **modpack
distribution tool**: create isolated game instances, assemble/sync modpacks,
launch PZ with per-instance config. v2 is a ground-up Tauri 2 rewrite of the
archived Electron + React v1.

## The four locked decisions

These are not up for re-litigation without a postmortem of their own.

### 1. Tauri 2 instead of Electron — bundle size

v1 shipped a ~150 MB bundle (bundled Chromium + Node). v2 uses **Tauri 2**,
which reuses the OS-provided **WebView2** runtime on Windows, yielding a
~15 MB installer. Consequence: Windows 10 must have the WebView2 Evergreen
runtime (Windows 11 ships it); `scripts/setup-windows.ps1` installs it on
Win10.

### 2. Disk is the only source of truth — instance state

v1 kept instance state in three places (in-memory store, on-disk JSON, and
whatever the UI last rendered). They diverged constantly. In v2:

- **Disk is authoritative.** There is no long-lived in-memory mirror of
  instance state in the backend.
- **Each instance is a self-contained folder** under
  `%APPDATA%/KnoxKit/instances/<uuid>/`. Deleting the folder deletes the
  instance. Copying the folder clones it.
- The UI holds a *cache* of disk state via TanStack Query, never a second
  source of truth. Mutations write disk, then invalidate the query.

### 3. Domain-level commands — IPC sprawl

v1 had **47 ad-hoc IPC handlers** — a handler per UI interaction, leaking
backend internals into the renderer. v2 exposes only **domain-level
commands** (e.g. `list_instances`, `create_instance`, `import_modpack`,
`export_modpack`, `launch_instance`). The frontend speaks intentions, not
mechanics.

### 4. One SteamCMD worker actor — fragile spawning

v1 spawned `steamcmd` ad hoc per request, scraped stdout with brittle
inline string matching, and hung when the child died. v2 has **one
long-running worker actor** with a job queue, a **pure, unit-tested
parser**, and **restart-on-crash**. Details below.

## Backend layering (`src-tauri/src/`)

Strict, one-directional dependency flow:

```
domain/      pure types — NO IO, NO async, NO tauri imports
   ▲
services/    async + IO business logic (disk, process, network)
   ▲
commands/    ONLY #[tauri::command] thin delegates into services/
```

Rules:

- **`domain/`** — plain data + pure functions. `domain/instance.rs`,
  `domain/modpack.rs`, etc. If it needs `tokio`, `std::fs`, or `tauri`, it
  does not belong here. These types are the contract mirrored by the
  frontend's `src/types/`.
- **`services/`** — all the messy stuff: filesystem, the SteamCMD child,
  HTTP. Returns `Result<_, error::Error>`.
- **`commands/`** — each function is a `#[tauri::command]` that validates
  inputs and delegates straight into a service. No business logic here.
- **`error.rs`** — one crate error type (`thiserror`), re-exported at crate
  root (`pub use error::Error`). `anyhow` is acceptable at the very edges
  for context, but command/service signatures use the crate `Error`.

### Frontend ↔ Backend boundary

- **Frontend → Backend = commands only.** React components NEVER call
  `@tauri-apps/api` directly. All `invoke()` calls live in
  `src/lib/tauri/` (e.g. `src/lib/tauri/commands.ts`). Components import
  typed wrappers from there.
- **Backend → Frontend = events only.** The backend never "returns" async
  progress; it emits app events (e.g. `SteamcmdProgress`). The frontend
  subscribes via `src/lib/tauri/events.ts`.
- **Type mirroring.** Business types in `src/types/` mirror the Rust
  `domain/` structs one-to-one, with a `// keep in sync with
  src-tauri/src/domain/<file>.rs` comment at the top of each. There is no
  codegen; the comment is the contract. Reviewers check both sides.

## Data model — `%APPDATA%/KnoxKit/`

Disk layout *is* the data model.

```
%APPDATA%/KnoxKit/
├── index.json        # { instances: [{ id, name, path, last_played }] }
├── settings.json     # global app settings
├── cache/
│   └── workshop/<workshop_id>/   # shared, deduplicated mod cache
└── instances/<uuid>/
    ├── instance.json   # { id, name, jvm_args, game_version, ... }
    ├── mods.json       # { collections, workshop_ids }
    ├── saves/          # PZ save data for this instance
    └── workshop/       # filesystem junctions into cache/workshop/<id>/
```

Key points:

- **`index.json` is a fast lookup, not the truth.** It is a denormalized
  listing rebuilt from the instance folders. If it disagrees with the
  folders, the folders win.
- **Workshop cache is deduplicated.** A workshop item is downloaded once
  into `cache/workshop/<id>/`. Each instance that uses it gets a directory
  **junction** at `instances/<uuid>/workshop/<id>` pointing into the cache.
  Disk is shared; instances are still self-contained logically.
- **No SQLite.** JSON-on-disk only. The global index lives at
  `%APPDATA%/KnoxKit/index.json`. Atomic writes (write temp, fsync,
  rename) keep files from being torn on crash.

## SteamCMD worker design

One actor owns one long-running `steamcmd` child.

```
commands/  --JobSender(mpsc)-->  worker::Worker
                                     │ owns
                                     ▼
                              steamcmd child (anonymous login, +runscript)
                                     │ stdout lines
                                     ▼
                          parser::parse_line() (PURE)
                                     │ parser::Event
                                     ▼
                       app event: SteamcmdProgress { job_id, stage, percent }
```

- **Job queue.** A Tokio `mpsc` `JobSender` carries `job::Job` values:
  `DownloadMod { workshop_id }`, `VerifyMod { workshop_id }`, `Shutdown`.
- **Anonymous login + `+runscript` batching.** The child logs in
  anonymously and is fed batched commands via runscript files.
- **Pure parser.** `parser::parse_line(&str) -> Option<parser::Event>` has
  zero IO and zero async. It is exhaustively unit-tested against fixtures.
  The canonical line shapes are in `docs/steamcmd-protocol.md` — that doc
  is the source of truth; Agent C's `tests/parser_fixtures/*` must match
  it.
- **`Process` trait abstraction.** The child is behind a `Process` trait so
  tests inject a `MockProcess`. **The test suite NEVER spawns real
  SteamCMD.** Real SteamCMD runs only at runtime / manual integration
  (`just steamcmd-install` + `just steamcmd-run`).
- **Crash recovery.** Child dies mid-job → log it, restart the child,
  re-queue the job **once**. A second failure on the same job emits an
  error event and the job is dropped (no infinite restart loop).
- **Progress events.** Emitted as the app event `SteamcmdProgress {
  job_id, stage, percent }`. The frontend renders these; it never polls.

## Frontend structure (`src/`)

- **React 19 + TypeScript (strict) + Vite + Tailwind v4.**
- **UI components are hand-copied shadcn-style** under `src/components/ui/`.
  No runtime UI library dependency.
- **TanStack Router (file-based)** with routes:
  - `/` — dashboard / landing
  - `/instances` — instance library (all instances)
  - `/instances/$id` — single instance detail
  - `/mods` — mod / workshop browsing
  - `/settings` — global settings
  - `/modpack/import` — `.knoxpack` import flow
  Route tree is generated to `src/routeTree.gen.ts` (Vite plugin; see
  `vite.config.ts`).
- **TanStack Query** owns all server (= disk) state. It is the read cache.
- **Zustand is UI state ONLY** (modals open, current tab, transient
  selections). It never holds instance/modpack data — that is Query's job,
  backed by disk.
- **i18next** with `en` and `es-CL` locales.

## Tooling baseline

- **Bun 1.3.7 is the only JS runtime** (no Node/npm/pnpm). Text lockfile
  `bun.lock`.
- **Biome** is the single lint + format tool.
- **`just`** task runner; **`mise`** pins Rust 1.95.0 + Bun 1.3.7 (no
  Node). The `mise.toml` + `justfile` combo makes every dev machine
  identical with zero Docker.
- **Windows 10 / 11 only** for this bootstrap. Linux/macOS are open
  questions in `docs/future.md`.
