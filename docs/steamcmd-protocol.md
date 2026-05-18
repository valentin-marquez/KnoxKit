# SteamCMD stdout protocol

> **This document is the source of truth for SteamCMD line shapes.**
> `src-tauri/src/services/steamcmd/parser.rs` parses these; Agent C's
> fixtures in `src-tauri/tests/parser_fixtures/*` must match the shapes
> here. If a real-world SteamCMD line differs, reconcile it **here first**,
> then update the parser and fixtures — never the other way around.

## How parsing works

`parser::parse_line(&str) -> Option<parser::Event>` is a **pure**
function: no IO, no async, no state. It is fed stdout one line at a time.
Lines it does not recognize return `None` (silently ignored — SteamCMD
emits a lot of banner/noise). Recognized lines map to exactly one
`parser::Event` variant.

The worker drives a long-running `steamcmd` child (anonymous login,
`+runscript` batching) and turns `Event`s into the app event
`SteamcmdProgress { job_id, stage, percent }`. See `docs/architecture.md`.

> The parser is unit-tested only. The test suite NEVER spawns real
> SteamCMD — it feeds captured fixture text through `parse_line`. Real
> SteamCMD is exercised only via manual integration (`just steamcmd-run`).

## Normalization applied before matching

Every line is normalized first: outer whitespace is trimmed, then any
leading console prompt(s) (`Steam>`, possibly repeated, e.g.
`Steam>Steam>quit`) are stripped. So `Steam>Downloading item 42 ...`
parses identically to `Downloading item 42 ...`. SteamCMD also prefixes
some status lines with a single leading space; that is covered by the
outer trim.

## Recognized noise → `None`

These real lines are explicitly known and ignored so they cannot
fall through to a fuzzier match. All map to `None` (no event):

```
Redirecting stderr to 'C:\steamcmd\logs\stderr.txt'
Logging directory: 'C:\steamcmd\logs'
Connecting anonymously to Steam Public...
Loading Steam API...                       (note: no trailing OK)
[  0%] Checking for available updates...
[----] Verifying installation...
[----] Downloading update (12345 of 67890 KB)...
[ 33%] Downloading update...
```

The `[...]` self-update progress bar is matched structurally: a line
starting `[` whose bracketed content is only digits / `%` / `-` / `+` /
spaces is the SteamCMD self-updater (NOT a workshop download) → `None`.
`Loading Steam API...OK` is the one `Loading Steam API...` form that is
**not** noise — it is the `Ready` trigger.

## `parser::Event` variants

Each variant below lists its trigger line shape with ≥1 realistic
example. SteamCMD prefixes some status lines with a leading space — the
parser trims leading whitespace (and any `Steam>` prompt) before
matching.

### `LoginOk`

Anonymous login succeeded. Emitted on the success line(s) that follow
`Connecting anonymously to Steam Public...`.

```
Logged in OK
Waiting for user info...OK
```

`Logged in OK` is the authoritative trigger. `Waiting for user
info...OK` and `Waiting for client config...OK` are corroborating and
**are** also emitted as `LoginOk` (idempotent — duplicate `LoginOk` is
harmless to the worker). Consequently a normal anonymous-login sequence
emits `LoginOk` more than once; fixtures and tests reflect this.

### `LoginFailed { reason }`

Login attempt failed. `reason` is the trailing text after `result code`.

```
Waiting for user info...FAILED login with result code Rate Limit Exceeded
FAILED login with result code No Connection
FAILED login with result code (No Connection).
Waiting for user info...FAILED (Rate Limit Exceeded)
Login Failure: Account Logon Denied.
```

All of the above yield `LoginFailed`. `reason` is the trailing text
after `result code`, OR the parenthesized text, OR the text after
`Login Failure:` — surrounding `()`/`.` are stripped, so the first line
yields `LoginFailed { reason: "Rate Limit Exceeded" }` and the last
yields `LoginFailed { reason: "Account Logon Denied" }`. The bare
`...FAILED (reason)` form is only treated as a login failure when the
line starts with `Waiting for` (otherwise an unrelated `FAILED` is noise
→ `None`). SteamCMD often retries automatically, so a `LoginFailed`
followed later by `LoginOk` is the normal "login retry" sequence
(fixture: `login_retry.txt`).

**Steam Guard / two-factor.** An anonymous batch session can never
supply an interactive code, so a Steam Guard prompt would hang the
worker forever. These are mapped to `LoginFailed { reason: "Steam Guard
required" }` so the worker fails the job cleanly:

```
Steam Guard code:
Two-factor code:
This account is protected by Steam Guard.
```

Fixture: `login_steam_guard.txt`.

### `DownloadStarted { workshop_id }`

A workshop item download/update has begun. `workshop_id` is the numeric
id.

```
Downloading item 2392709985 ...
```

Yields `DownloadStarted { workshop_id: 2392709985 }`. A non-numeric id
(`Downloading item notanumber ...`) is **not** a valid line → `None`
(see `malformed.txt`).

### `DownloadProgress { workshop_id, percent }`

Periodic progress for the in-flight item. **Any** `Update state ...`
line that carries a numeric `progress:` token is surfaced — the state
phase in parentheses is informational only. Observed/likely phases:

```
 Update state (0x3)  reconfiguring,  progress:   0.00 (0 / 0)
 Update state (0x11) preallocating,  progress:   0.00 (0 / 10485760)
 Update state (0x61) downloading,    progress:  42.13 (4213000 / 10000000)
 Update state (0x5)  validating,     progress: 100.00 (10485760 / 10485760)
 Update state (0x81) committing,     progress: 100.00 (10000000 / 10000000)
 Update state (0x101) committing,    progress: 100.00 (10 / 10)
```

The percent is the leading numeric run after `progress:` (rounded to
`u8`, clamped 0..=100). A **rate/ETA suffix** is tolerated and ignored
because only that leading numeric run is parsed:

```
 Update state (0x61) downloading, progress: 25.40 (2663383 / 10485760), 1.21 MB/s, ETA 00:00:06
```

→ `DownloadProgress { percent: 25 }`. The progress line does **not**
repeat the workshop id — the worker associates it with the id from the
most recent `DownloadStarted` (the parser emits a sentinel
`workshop_id: 0`). A non-numeric percent (`progress: notapercent`) →
`None`. **Behavior note (changed):** earlier the parser only surfaced
`downloading`-phase lines; it now surfaces every phase that has a
numeric `progress:`, so a clean download emits an extra leading
`progress: 0.00` event from the reconfiguring/preallocating phase
(reflected in `download_success.txt`'s expected events).

### `DownloadSuccess { workshop_id, path }`

The item finished successfully. `path` is the quoted destination
directory; the trailing `(<n> bytes)` is informational.

```
Success. Downloaded item 2392709985 to "C:\steamcmd\steamapps\workshop\content\108600\2392709985" (10000000 bytes)
Success. Downloaded item 7 to "/home/user/.steam/steamapps/workshop/content/108600/7" (5 bytes)
```

Yields `DownloadSuccess { workshop_id, path }`. The path is whatever is
inside the first pair of `"` quotes — Windows backslash paths and POSIX
forward-slash paths are both accepted verbatim; the trailing
`(<n> bytes)` is informational and ignored. A
`Success. Downloaded item  to "" ()` line with empty id/path is malformed
→ `None`.

### `DownloadFailed { workshop_id, error }`

The item failed. `error` is the parenthesized reason.

```
ERROR! Download item 999999999 failed (Failure).
ERROR! Download item 2392709985 failed (No subscription).
ERROR! Download item 111 failed (Timeout).
ERROR! Download item 222 failed (Access Denied).
```

`error` is the text inside the first `( ... )` of the failure tail
(`Timeout`, `Access Denied`, `No subscription`, …); if absent it falls
back to `Failure`. The first yields `DownloadFailed { workshop_id:
999999999, error: "Failure" }`. `ERROR! something unrelated happened` is
**not** a download failure → `None` (it is generic SteamCMD noise;
fixture `malformed.txt`). Variant reasons fixture:
`download_failed_variants.txt`.

### `Ready`

The client is up, the console prompt is available, and SteamCMD is ready
to accept commands. Triggered by the API-loaded line that follows the
client banner.

```
Steam Console Client (c) Valve Corporation - version 1717360273
-- type 'quit' to exit --
Loading Steam API...OK
```

`Loading Steam API...OK` is the trigger for `Ready`. (The banner and
`-- type 'quit' to exit --` lines are recognized noise → `None`.)

### `Quit`

The console session is ending — the runscript issued `quit` and SteamCMD
is shutting down.

```
Steam>quit
```

Yields `Quit`. The worker uses this to know the child is exiting cleanly
(versus an unexpected EOF, which triggers crash recovery — see
`docs/architecture.md`).

## `app_info_print` — branch discovery (one-shot, NOT the worker)

A **separate, bounded one-shot** call powers the `list_branches` command —
it is not driven by the long-running worker (that actor is for Workshop
downloads only). Anonymous SteamCMD can read app `108600`'s public appinfo:

```
steamcmd +login anonymous +app_info_update 1 +app_info_print 108600 +quit
```

The output is Valve **KeyValues** text. The relevant subtree is
`"108600" → "depots" → "branches"`; each immediate child of `"branches"`
is one branch — the key is the Steam branch name (`public`, `unstable`,
`outdatedunstable`, …), with scalars `"buildid"`, optional `"description"`
(absent on `public`), and `"timeupdated"`. Canonical frozen sample:

```
	"branches"
	{
		"public" { "buildid" "22695648" "timeupdated" "1775656124" }
		"unstable" { "buildid" "23177452" "description" "Latest Build 42 - UNSTABLE - BACKUP FIRST" "timeupdated" "1778497669" }
		"outdatedunstable" { "buildid" "22869276" "description" "Unstable fallback branch for rollbacks and prior saves." "timeupdated" "1778502196" }
	}
```

Real `app_info_print` emits this tab-indented, one `"key" "value"` per
line; the parser is whitespace/tab tolerant and proven on both shapes.
This is parsed by **`services::steamcmd::appinfo_parser::parse_branches`**
(pure, zero IO/async, hand-rolled quote/brace scan — no `vdf` crate),
fixture `tests/parser_fixtures/appinfo_branches.txt`. The async one-shot +
60 s timeout + static-fallback policy lives in
`services::steamcmd::appinfo`; on **any** failure (no steamcmd, spawn
error, timeout, empty parse) it returns the static fallback
(`Stable`/`Unstable`/`OutdatedUnstable`) so instance creation is never
blocked. **TODO(review):** confirm byte-exact framing against a real
`just steamcmd-run +app_info_print 108600` once steamcmd is installed.

## Fixture cross-reference

Several fixtures emit `Ready` / `LoginOk` more than once on purpose (the
banner pair and the corroborating `Waiting for ...OK` lines — see the
`LoginOk` and `Ready` notes above). The exact ordered sequences are
asserted in `parser.rs`'s `#[cfg(test)] mod tests`.

| Fixture | Scenario | Events expected (in order) |
|---|---|---|
| `download_success.txt` | clean download, anon login | `Ready` x2, `LoginOk` x4, `DownloadStarted(2392709985)`, `DownloadProgress(0)` then several more, `DownloadSuccess(2392709985, ...)`, `Quit` |
| `download_failed_private.txt` | item fails (e.g. private/removed) | `Ready` x2, `LoginOk` x2, `DownloadStarted(999999999)`, `DownloadProgress`, `DownloadFailed(999999999, "Failure")`, `Quit` |
| `download_failed_variants.txt` | alternate failure reasons | `Ready` x2, `LoginOk`, then 3x `DownloadStarted`+`DownloadFailed` with `"Timeout"`, `"Access Denied"`, `"No subscription"`, `Quit` |
| `login_retry.txt` | login rate-limited then succeeds | `Ready` x2, `LoginFailed("Rate Limit Exceeded")`, `LoginOk` x2, `Quit` |
| `login_steam_guard.txt` | Steam Guard blocks anon batch login | `Ready` x2, `LoginFailed("Account Logon Denied")`, `LoginFailed("Steam Guard required")`, `Quit` |
| `download_progress_rate.txt` | self-update bar + banner noise, rate/ETA suffixes, POSIX path | noise/bar → `None`, `Ready` x2, `LoginOk`, `DownloadStarted`, several `DownloadProgress`, `DownloadSuccess(.../POSIX path)`, `Quit` |
| `malformed.txt` | garbage + malformed near-misses | all lines → `None` (parser must not panic and must not emit events) |

If the parser or fixtures drift from this table, **this document wins** —
update them to match, or amend this doc first via a `docs(steamcmd)`
commit and note it in `NOTES.md` for Agent C.
