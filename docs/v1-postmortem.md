# KnoxKit v1 — Postmortem

> One page. No marketing. v1 (`valentin-marquez/KnoxKit`, Electron + React)
> is archived. This is exactly what went wrong and exactly how v2's locked
> decisions answer each failure. If a v2 decision ever feels annoying, this
> is why it exists.

## Failure 1 — 150 MB bundle

**What happened.** v1 was Electron. Every install shipped a full bundled
Chromium plus a Node runtime. The installer was ~150 MB for an app that is,
functionally, a folder manager and a process babysitter. Updates were huge,
downloads were slow, and the disk footprint was indefensible for the
feature set.

**v2's answer — Tauri 2.** Tauri uses the OS-provided **WebView2** runtime
on Windows instead of bundling a browser. The v2 installer is ~15 MB —
roughly a 10× reduction. Cost: Windows 10 must have the WebView2 Evergreen
runtime (Windows 11 ships it); `scripts/setup-windows.ps1` installs it on
Win10. That one dependency is a fair trade for not shipping Chromium.

## Failure 2 — instance state diverged across memory, disk, and UI

**What happened.** An instance's state lived in three places: an in-memory
store in the main process, JSON files on disk, and whatever the renderer
last rendered. There was no single owner. They drifted constantly: edit an
instance, the UI showed stale data; restart the app, changes were lost;
external edits to the JSON were ignored or clobbered. Most v1 bug reports
traced back to this.

**v2's answer — disk is the only source of truth.** There is no long-lived
backend mirror of instance state. Each instance is a **self-contained
folder** under `%APPDATA%/KnoxKit/instances/<uuid>/`; deleting the folder
deletes the instance, copying it clones it. The UI holds only a TanStack
Query *cache* of disk state — never a second authority. Every mutation
writes disk (atomic temp-then-rename), then invalidates the query. If
`index.json` ever disagrees with the folders, the folders win.

## Failure 3 — IPC sprawl (47 ad-hoc handlers)

**What happened.** v1 grew **47 ad-hoc IPC handlers**, roughly one per UI
interaction. The renderer drove backend mechanics directly. Backend
internals leaked into the frontend, refactors broke the UI in
non-obvious ways, and "where does this happen?" had no clean answer because
behavior was smeared across dozens of tiny handlers.

**v2's answer — domain-level commands only.** The frontend speaks
*intentions*, not mechanics: `list_instances`, `create_instance`,
`import_modpack`, `export_modpack`, `launch_instance`. Strict layering:
`commands/` are thin `#[tauri::command]` delegates, `services/` hold the
async/IO logic, `domain/` is pure types. Frontend → backend is **commands
only** (all `invoke`s funnel through `src/lib/tauri/`); backend → frontend
is **events only**. The boundary is small and explicit.

## Failure 4 — fragile ad-hoc SteamCMD spawning

**What happened.** v1 spawned `steamcmd` ad hoc per request and scraped its
stdout with brittle inline string matching scattered through the codebase.
When the child died mid-download, the app **hung** waiting on a pipe that
would never produce more output. Parsing logic was untestable because it
was tangled with process spawning.

**v2's answer — one worker actor, pure parser, restart-on-crash.** A single
long-running `worker::Worker` owns one `steamcmd` child and pulls
`job::Job`s off a Tokio mpsc queue. Stdout is parsed by **`parser::parse_line`
— a pure, fully unit-tested function** (line shapes are frozen in
`docs/steamcmd-protocol.md`). The child sits behind a `Process` trait so
the test suite uses a `MockProcess` and **never spawns real SteamCMD**. If
the child dies mid-job: log it, restart, re-queue the job **once**; a
second failure emits an error event instead of hanging forever. Progress is
pushed as `SteamcmdProgress` events, never polled.

---

Each v2 decision above is *locked*. Re-litigating one requires a
postmortem of its own — see `docs/architecture.md` for the standing
rationale.
