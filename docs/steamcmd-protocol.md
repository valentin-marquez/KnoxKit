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

## `parser::Event` variants

Each variant below lists its trigger line shape with ≥1 realistic
example. SteamCMD prefixes some status lines with a leading space — the
parser trims leading whitespace before matching.

### `LoginOk`

Anonymous login succeeded. Emitted on the success line(s) that follow
`Connecting anonymously to Steam Public...`.

```
Logged in OK
Waiting for user info...OK
```

`Logged in OK` is the authoritative trigger. `Waiting for user
info...OK` / `Waiting for client config...OK` are corroborating and may
also be treated as `LoginOk` (idempotent — duplicate `LoginOk` is
harmless).

### `LoginFailed { reason }`

Login attempt failed. `reason` is the trailing text after `result code`.

```
Waiting for user info...FAILED login with result code Rate Limit Exceeded
FAILED login with result code No Connection
```

Example: the line above yields `LoginFailed { reason: "Rate Limit
Exceeded" }`. SteamCMD often retries automatically, so a `LoginFailed`
followed later by `LoginOk` is the normal "login retry" sequence
(fixture: `login_retry.txt`).

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

Periodic progress for the in-flight item. The percent is the float after
`progress:`. The state code in parentheses (`0x61` downloading, `0x81`
committing, `0x3` reconfiguring, etc.) is informational; the percent is
what is surfaced.

```
 Update state (0x61) downloading, progress: 42.13 (4213000 / 10000000)
 Update state (0x81) committing, progress: 100.00 (10000000 / 10000000)
 Update state (0x3) reconfiguring, progress: 0.00 (0 / 0)
```

The first line yields `DownloadProgress { workshop_id: <current>, percent:
42.13 }`. Note: the progress line itself does **not** repeat the workshop
id — the worker associates it with the id from the most recent
`DownloadStarted`. A non-numeric percent (`progress: notapercent`) → `None`.

### `DownloadSuccess { workshop_id, path }`

The item finished successfully. `path` is the quoted destination
directory; the trailing `(<n> bytes)` is informational.

```
Success. Downloaded item 2392709985 to "C:\steamcmd\steamapps\workshop\content\108600\2392709985" (10000000 bytes)
```

Yields `DownloadSuccess { workshop_id: 2392709985, path:
"C:\\steamcmd\\steamapps\\workshop\\content\\108600\\2392709985" }`. A
`Success. Downloaded item  to "" ()` line with empty id/path is malformed
→ `None`.

### `DownloadFailed { workshop_id, error }`

The item failed. `error` is the parenthesized reason.

```
ERROR! Download item 999999999 failed (Failure).
ERROR! Download item 2392709985 failed (No subscription).
```

The first yields `DownloadFailed { workshop_id: 999999999, error:
"Failure" }`. `ERROR! something unrelated happened` is **not** a download
failure → `None` (it is generic SteamCMD noise; fixture `malformed.txt`).

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

## Fixture cross-reference

| Fixture | Scenario | Events expected (in order) |
|---|---|---|
| `download_success.txt` | clean download, anon login | `Ready`, `LoginOk`, `DownloadStarted(2392709985)`, several `DownloadProgress`, `DownloadSuccess(2392709985, ...)`, `Quit` |
| `download_failed_private.txt` | item fails (e.g. private/removed) | `Ready`, `LoginOk`, `DownloadStarted(999999999)`, `DownloadProgress`, `DownloadFailed(999999999, "Failure")`, `Quit` |
| `login_retry.txt` | login rate-limited then succeeds | `Ready`, `LoginFailed("Rate Limit Exceeded")`, `LoginOk`, `Quit` |
| `malformed.txt` | garbage + malformed near-misses | all lines → `None` (parser must not panic and must not emit events) |

If the parser or fixtures drift from this table, **this document wins** —
update them to match, or amend this doc first via a `docs(steamcmd)`
commit and note it in `NOTES.md` for Agent C.
