# Instance redesign — design proposal (v2 schema, creation flow, RAM, modpack identity, profile)

> **Status:** proposal for review. No code is written from this yet.
> Sourced from three research passes (PZ Steam branches; PZ runtime/startup
> params/RAM; PZ MP identity + modpack model). Authoritative citations at the
> end. Anything version-dated or unverified is labelled **(uncertain)**.

## 0. Why

The current `instance::Instance` is minimal — `name, game_version: String,
jvm_args, created_at, last_played, path`. It cannot express: which PZ branch
the instance targets, a per-instance RAM cap, an icon, or the modpack identity
needed to make instance→`.knoxpack`→instance lossless. The "New instance" flow
is a single hardcoded action. This doc proposes the schema, mechanics and UX to
fix that, in four reviewable phases.

## 1. Corrected mental model (important)

**KnoxKit cannot change the game's Steam branch.** App `108600` (the game) is
installed by the Steam **client**; anonymous SteamCMD can only fetch **Workshop
content**, not the game. So a "branch" choice in the create dialog is **recorded
intent + a compatibility hint**, not something KnoxKit installs. KnoxKit should
*detect* the installed branch by reading `steamapps/appmanifest_108600.acf`
(`betakey` empty ⇒ B41 stable; `unstable` ⇒ B42; `outdatedunstable` ⇒ save-compat
B42) and **warn** when an instance's intended branch ≠ the detected install
(B41 mods don't load on B42 and vice-versa — see §5).

Real branches (W1): default/`public` = **B41 stable** (41.78.x) · `unstable`
= **B42** (42.x, rolling) · `outdatedunstable` = previous B42 (save-compat).
`legacy41` does **not** exist — dropped. Build numbers are runtime-discovered,
never hardcoded.

## 2. Proposed `Instance` schema (v2)

Bump `instance::SCHEMA_VERSION` `1 → 2`. New fields are additive/optional;
the one **breaking** change is `game_version: String → GameVersion { branch,
build }` (decision §9.1), handled by the lazy migration below. Old instances
keep working (migrated on read).

| Field | Rust type | TS mirror | Purpose |
|---|---|---|---|
| `game_version` *(changed)* | `GameVersion { branch: Branch, build: Option<String> }` | `{ branch: Branch; build: string \| null }` | PZ branch intent + discovered build (see §3); replaces the old free string |
| `max_ram_mb` | `Option<u32>` | `number \| null` | Per-instance heap cap; overrides global; `None` ⇒ global/default (§4) |
| `icon_path` | `Option<String>` | `string \| null` | Relative path to instance icon (`icon.png` in the folder); becomes `.knoxpack` `icon.png` on export |
| `description` | `Option<String>` | `string \| null` | → manifest `description` |
| `author` | `Option<String>` | `string \| null` | → manifest `author` (defaults from profile §6) |
| `pack_version` | `Option<String>` | `string \| null` | → manifest `version`; lets re-export bump |
| `pack_id` | `Option<String>` | `string \| null` | Stable UUID identity across versions → manifest `pack_id`; enables **update vs create** on import |
| `source` | `Option<Source>` | `Source \| null` | Managed-pack link (Prism-style): which pack+version this instance was instantiated from |

`Source` (new small pure type in `domain/instance.rs`):
`{ kind: "knoxpack", pack_id: String, pack_version: String }`.

`Branch` (new pure enum, snake_case wire, no serde rename per `CLAUDE.md`):
`Stable | Unstable | OutdatedUnstable | Other(String)` (the `Other` arm is
forward-compat for future Steam branch names).

### Migration (1 → 2), lazy, disk-is-truth

`disk::read` already owns deserialization. On reading an instance whose
`schema_version == 1`: map it to v2 in memory — old free `game_version` →
`GameVersion { branch, build }` (`branch = Unstable` if the string contained
`beta`/`unstable`, else `Stable`; `build = Some(old_string)` when it looked
like a version like `41.78.16`, else `None`); all new `Option` fields `None`;
`max_ram_mb = None` — then **rewrite the file as v2** (atomic write already
exists). No separate migration command, no one-shot pass —
consistent with "disk is the only source of truth" and the `index.json`
rebuild-from-folders philosophy. `instance::Input` gains the same optional
fields (all defaulted) so `create_instance` stays backward-compatible.

`modpack::Manifest` already has `pack_id/name/version/author/description/
game_version` — so export becomes **lossless** once the instance carries the
same data; no `.knoxpack` format change, no `schema_version` bump there.

## 3. Branch / version model

- `game_version.branch` is user intent (persisted). `game_version.build` is
  the advisory build string (e.g. `"41.78.16"`), discovered/refreshed from the
  detected install, not authored.
- `Branch → Steam name`: `Stable→"" (default)`, `Unstable→"unstable"`,
  `OutdatedUnstable→"outdatedunstable"`, `Other(s)→s`. Used for **display +
  the detected-vs-intended comparison only** (KnoxKit does not invoke SteamCMD
  on the game).
- `Branch → mod compatibility`: Stable ⇒ B41 mod layout (`mods/<Name>/`,
  `mod.info` at root). Unstable/OutdatedUnstable ⇒ B42 layout (`mods/<Name>/
  common/` + `mods/<Name>/42/`). This affects `pz.rs` mod-junction discovery —
  flagged for the icon/mods phase, **(uncertain)** exact B42 nesting, verify on
  a real B42 mod.

## 4. Per-instance RAM — mechanism, the bug, the slider

### Known bug (found by research, real)

`launch::build_args` emits `[<jvm_args…>, -cachedir=…, -modfolders, mods]`
with **no `--` separator**. PZ's documented contract: *JVM args first,
terminated by a literal `--`, then game args*. So a user `-Xmx4g` in
`jvm_args` today is mis-parsed / ineffective, and the current `launch.rs`
unit tests assert this buggy shape. This must be fixed as part of RAM work.

### Recommended mechanism: per-instance `-pzexeconfig` (what v1 did)

`ProjectZomboid64.exe` is a thin launcher that reads
`<gameDir>/ProjectZomboid64.json` (`vmArgs`) and spawns the bundled JRE.
Robust per-instance heap = generate `<instance>/<id>.pzexe.json` from the
install's JSON (fallback to a frozen template), replace `-Xmx`, keep
everything else, and launch:

```
ProjectZomboid64.exe -pzexeconfig <instance>/<id>.pzexe.json \
  -pzexelog <instance>/launcher.log -cachedir=<instance> -modfolders mods
```

This guarantees the heap per instance, mutates **no** global file, and avoids
the brittle command-line `--` contract entirely. (Keep `-cachedir` for save
isolation — drop v1's `-Duser.home`; the B42 wiki documents `-cachedir`.)
Preserve the install's existing GC flags rather than hardcoding ZGC/G1GC
(B42 GC/Java is **(uncertain)**).

*Minimum alternative* if we don't adopt `-pzexeconfig` now: insert a literal
`"--"` between JVM and game args **and** derive `-Xmx{N}m` from the new
structured `max_ram_mb` (stop trusting free-form `jvm_args` for heap). Less
robust; documented here as the fallback.

### Reading real total RAM + slider policy

Read **actual** physical RAM (never hardcode a max — v1's bug capped at 8 GB).
Recommended: `windows-sys` `GlobalMemoryStatusEx().ullTotalPhys` (tiny, exact,
Windows-only is fine; the repo already pulls `windows-sys` transitively).
`sysinfo` (default-features off) is the least-code fallback.

Slider policy: **min** 2048 MB · **max** = real machine total (show the true
number) · **warn** >70% · **danger** >85% · **launch hard-clamp**
`min(total − 2048 MB, total × 0.90)` (PZ's LWJGL/GL allocations live off-heap)
· **default for a new instance** `clamp(round512(total × 0.5), 3072, 8192)`
MB. Per-instance `max_ram_mb` overrides global setting overrides default.

## 5. B41 vs B42 — launcher-relevant deltas (for docs + branch logic)

| Aspect | B41 (stable) | B42 (`unstable`) |
|---|---|---|
| Client exe | `ProjectZomboid64.exe` (+ legacy 32-bit) | `ProjectZomboid64.exe` (64-bit only) |
| Launcher cfg | `ProjectZomboid64.json` (game dir, global) | same name/format |
| Isolation arg | `-cachedir` (and legacy `-Duser.home`) | `-cachedir` (`-Duser.home` no longer documented) |
| Mod folder layout | `mods/<Name>/` flat, `mod.info` at root | `mods/<Name>/common/` + `mods/<Name>/42/` |
| Mod activation | `<cachedir>/Server/servertest.ini` `Mods=`/`WorkshopItems=` | **same contract** (structure differs, not the ini) |
| Bundled Java / GC | Java 17, ZGC in install vmArgs | **(uncertain)** — read & preserve install's vmArgs, don't assume |

`-pzexeconfig`/`-pzexelog` are officially documented on B42, worked in
practice on B41 (v1 used them). `<cachedir>` relocates the whole `Zomboid`
tree → `Saves/ mods/ Server/ Lua/ db/ options.ini console.txt` are all
**per-instance**; the game binaries + `ProjectZomboid64.json` are **global**
(why per-instance heap needs `-pzexeconfig`, not editing that file).

## 6. Profile (username only — your decision)

PZ MP identity = a player-chosen **account username + password, per-server,
not tied to Steam**. You chose **username only**. Add to `settings.rs` /
`src/types/settings.ts`:

- `profile_username: Option<String>` — plaintext is fine (not a secret).
  Editable in a new **sidebar profile area (under the theme toggle)** and an
  **optional, non-gating** onboarding step (must NOT block first run —
  `setup::Status` keeps gating only on `game_path` + `steamcmd_path`).

Used to: default `instance.author`, pre-fill future "add server" forms, and
auto-fill `user=` if KnoxKit ever pre-seeds a saved server. **No password
stored anywhere.** If a password is ever wanted later: OS keychain
(`keyring-core` + Windows Credential Manager), never settings.json, never
Stronghold (deprecated). Documented for the future; **out of scope now**.

*Bonus finding (future, not now):* PZ persists saved servers at
`Zomboid/Lua/ServerListSteam.txt` (verified flat `key=value`:
`name/ip/localip/port/serverpassword/description/user/password`). A modpack
could pre-seed a server record there (minus the player password). Parked for
a future "modpack ships a server" feature.

## 7. UX — creation flow

- **Button → dialog morph:** the "New instance" button uses `motion` shared
  layout (`layoutId`) to morph into the create `Dialog` (component exists),
  consistent with the elastic vocabulary in `lib/anim.ts`.
- **Dialog fields:** name · branch (the improved `Select`: Stable B41 /
  Unstable B42 / Outdated Unstable) · version/build (optional, advisory) ·
  RAM slider (real machine total, policy §4) · icon picker
  (`dialog.pickFile` → copied into the instance folder as `icon.png`) ·
  optional description / author (defaulted from profile) / pack version.
- **Instance = modpack base, first-class:** the detail view surfaces pack
  identity (icon, author, version, description) and an Export that is now
  lossless; import sets `source` + `pack_id` enabling **update vs create**.

## 8. Phased implementation plan (your 4 priorities)

Each phase is independently shippable; later phases assume earlier schema.

- **P1 — schema v2 + branch + creation dialog.** `domain/instance.rs`
  (`Branch`, `Source`, new fields, `SCHEMA_VERSION=2`), lazy migration in
  `disk.rs`, TS mirror, `create_instance` input, button→dialog morph with
  branch/version selectors + detected-branch warning.
- **P2 — per-instance RAM.** Total-RAM read (`windows-sys`), `max_ram_mb`
  field, adopt `-pzexeconfig` generation, **fix the `--`/launch bug** and its
  tests, RAM slider UI.
- **P3 — icon + modpack identity.** `icon_path/description/author/
  pack_version/pack_id/source`; copy icon into instance folder; make
  export/import lossless (no `.knoxpack` format change); icon picker.
- **P4 — profile.** `settings.profile_username`; sidebar profile area +
  optional non-gating onboarding step; default `author` from it.

Phases are parallelizable in the usual disjoint-scope way (P1 backend-heavy,
P4 mostly settings/UI, etc.) — to be partitioned when approved.

## 9. Locked decisions (reviewed)

1. **Schema shape: structured `game_version: { branch, build }`** replaces the
   free `String` on `instance::Instance` (W1's stricter model). `branch:
   Branch` enum + `build: Option<String>` (runtime-discovered, not authored).
   Migration maps the old free string (`"stable"`/`"beta"`/`"unstable"`/`""`/
   `"41.78.x"`) → `{ branch, build }`.
   - **Portable-format guard (resolved):** `modpack::Manifest.game_version`
     **stays `String`** in the `.knoxpack` manifest — on export it is a derived
     display projection of the structured value (e.g. `"42 (unstable)"` /
     `"41.78.16"`); on import it is parsed best-effort back into `{ branch,
     build }`. This keeps the `.knoxpack` schema at `schema_version = 1` (no
     breaking format change, forward-compat preserved). Structured-in-app,
     string-on-the-wire.
2. **RAM mechanism: `-pzexeconfig` per-instance JSON** (robust; supersedes and
   fixes the `--` bug at the root).
3. **Total-RAM dependency: `sysinfo`** with `default-features = false`
   (least hand-written FFI; standard crate).

## 10. Sources

PZ branches/SteamCMD: projectzomboid.com/blog (B42 unstable, B42 MP), Steam
news app 108600 (42.16/42.17/42.18, `outdatedunstable`), Valve SteamCMD wiki +
SteamCMD-Commands-List, pinehosting/winternode branch guides. — Runtime:
PZwiki `Startup_parameters` (B42 rev 1310629 & B41 rev 129667 via Wayback),
PZwiki `File_structure`, Steam "Java/GC/Memory" guide. — MP identity/modpack:
Steam discussions (per-server username/password), Aceeri `ServerListSteam.txt`
(verified), Modrinth `.mrpack` docs, PrismLauncher instance-management docs,
Tauri Stronghold deprecation notice, docs.rs `keyring` 4.0.1. Full URLs in the
research transcripts. **(uncertain)** items: B42 Java/GC version, B42 mod
nesting, B42 `ServerListSteam.txt` parity, anonymous 380870 download — all
flagged inline; verify against a real B42 install before relying on them.
