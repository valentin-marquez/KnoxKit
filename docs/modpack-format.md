# The `.knoxpack` modpack format

> Written as an open standard. A third party should be able to implement a
> `.mrpack` → `.knoxpack` converter against this document alone. The
> reference implementation lives in
> `src-tauri/src/services/modpack/`; conformance fixtures are in
> `src-tauri/tests/modpack_fixtures/`.

**Status:** `schema_version = 1`. Stable for v1.

## 1. Container

A `.knoxpack` file is a **ZIP archive**. The recommended file extension is
`.knoxpack`; the MIME type is `application/zip`.

```
my-pack.knoxpack            (ZIP)
├── knoxpack.json           required — the manifest (UTF-8 JSON)
├── overrides/              optional — whitelisted config files only
│   ├── jvm-args.txt
│   └── servertest.ini
├── icon.png                optional — 256x256 PNG, shown in import dialog
└── README.md               optional — rendered (Markdown) in import dialog
```

- `knoxpack.json` **must** exist at the archive root.
- `overrides/`, `icon.png`, `README.md` are optional.
- Any archive entry not listed above is **ignored** (forward
  compatibility) — except that disallowed paths under `overrides/` cause
  the import to be rejected (see §4).

## 2. Manifest — `knoxpack.json`

UTF-8 encoded JSON object. Example (this is the canonical reference
manifest; the conformance copy is `tests/modpack_fixtures/valid.json`):

```json
{
  "schema_version": 1,
  "format": "knoxpack",
  "pack_id": "b3f1c2a4-5d6e-7f80-9a1b-2c3d4e5f6071",
  "name": "Build 41 Hardcore",
  "version": "1.2.0",
  "author": "valentin",
  "description": "Balanced for 4-player MP, lethal zombies",
  "game_version": "41.78.16",
  "created_at": "2026-05-17T12:00:00Z",
  "workshop_items": [
    {
      "workshop_id": 2392709985,
      "display_name": "Brita's Weapon Pack",
      "required": true,
      "expected_hash": "sha256:...",
      "load_order": 1
    }
  ],
  "mod_load_order": ["BritasWeaponPack", "..."],
  "map_load_order": ["BedfordFalls", "Muldraugh, KY"],
  "recommended_sandbox": { "Zombies": 3 }
}
```

### 2.1 Top-level fields

| Field | Type | Req | Semantics |
|---|---|---|---|
| `schema_version` | integer | **required** | Manifest schema version. `1` for this spec. See §5 for the versioning policy. |
| `format` | string | **required** | Must be the literal `"knoxpack"`. Lets a generic ZIP be distinguished from a knoxpack. |
| `pack_id` | string (UUID v4) | **required** | **Stable machine identity of the pack across versions.** See §3. |
| `name` | string | **required** | Human-readable pack name shown in the UI. |
| `version` | string | **required** | Human, semver-ish pack version (e.g. `1.2.0`). Not machine-keyed — see §3. |
| `author` | string | **required** | Pack author / maintainer handle. |
| `description` | string | optional | Free text; shown in the import dialog. |
| `game_version` | string | **required** | Target Project Zomboid build (e.g. `41.78.16`). Advisory; mismatch is a warning. |
| `created_at` | string (RFC 3339 / ISO 8601 UTC) | **required** | When this pack version was exported. |
| `workshop_items` | array<WorkshopItem> | **required** | The Steam Workshop items the pack references. May be empty. See §2.2. |
| `mod_load_order` | array<string> | **required** | Ordered PZ **mod ids** (the `id=` from `mod.info`). Distinct from `workshop_items` order — see §2.3. May be empty. |
| `map_load_order` | array<string> | **required** | Ordered PZ map folder names (e.g. `"Muldraugh, KY"`). May be empty. |
| `recommended_sandbox` | object | optional | Free-form map of PZ sandbox option → value. Values may be numbers **or** strings (e.g. `{"Zombies": 3, "Speed": "fast"}`). Purely advisory; never auto-applied without user confirmation. |

### 2.2 `WorkshopItem` object

| Field | Type | Req | Semantics |
|---|---|---|---|
| `workshop_id` | integer | **required** | Steam Workshop file id. Used to download via SteamCMD at import time. |
| `display_name` | string | **required** | Human name for the item (UI only; the id is authoritative). |
| `required` | boolean | **required** | `true` = pack is broken without it; `false` = optional/cosmetic, importer may let the user skip it. |
| `expected_hash` | string | optional | Advisory integrity hint, format `sha256:<hex>`. See §4. |
| `load_order` | integer | **required** | Stable ordering key for the *download/listing* of workshop items. **Not** the PZ mod load order (that is `mod_load_order`). |

**Validation:** `workshop_id` values **must be unique** within
`workshop_items`. A duplicate id is a hard validation error (conformance
fixture: `tests/modpack_fixtures/dup_workshop.json`). Rationale: two
entries for the same Workshop item are ambiguous for dedup and load order.

### 2.3 Why `mod_load_order` ≠ `workshop_items` order

Project Zomboid loads mods by the `id=` in each mod's `mod.info`, passed
as `mods=` to the game — **not** by Workshop item. A single Workshop item
frequently contains **several** PZ mod ids (a bundle), and the
game-relevant ordering is over those mod ids, not over Workshop downloads.
So:

- `workshop_items[].load_order` orders *what to download*.
- `mod_load_order` orders *what PZ actually loads*, by `mod.info` id.

A converter from another format must map the source's mod ordering into
`mod_load_order` and must not assume it equals the Workshop download list.

## 3. `pack_id` vs `version`

- **`pack_id`** is the *machine identity*. It is a UUID v4 that **stays
  constant for the life of the pack across every released version**. When a
  user imports a pack whose `pack_id` already exists locally, KnoxKit
  offers **"update"** (not "create a new pack"). Never regenerate
  `pack_id` for a new release.
- **`version`** is the *human* version (semver-ish string). It is what is
  shown to users and compared to decide whether an import is newer. It has
  no machine-identity role.

A fork that intends to be a *separate* pack must generate a **new**
`pack_id`. A new *release* of the *same* pack keeps `pack_id` and bumps
`version`.

## 4. Integrity hashes & override security

### `expected_hash` is advisory, not enforced

`expected_hash` is a `sha256:` digest computed over the Workshop item's
content **at export time**. At import time KnoxKit downloads the item from
Steam Workshop (it is **not** bundled — see §6) and may recompute the
hash.

A mismatch is a **warning, not an error**. Steam Workshop mods
auto-update; the content the author hashed may legitimately differ from
what the importer downloads later. The user is shown the mismatch and
decides whether to proceed. An importer **must not** hard-fail on hash
mismatch.

### `overrides/` is strictly whitelisted

Only these paths inside `overrides/` are honored:

- `overrides/jvm-args.txt`
- `overrides/servertest.ini`
- `overrides/serverconfig/*.ini`

**Any other path under `overrides/` causes the import to be rejected.**
This is a security boundary, not a convenience filter: a malicious pack
must not be able to drop arbitrary files (executables, DLLs, scripts,
path-traversal `../`) into the game directory or anywhere on disk.
Importers **must** validate every override entry against this whitelist
and reject the whole pack on any violation. (Conformance fixture for the
manifest-level case: `tests/modpack_fixtures/forbidden_override.json`;
path validation itself is enforced by `is_allowed_override`.)

## 5. Schema versioning policy

- An importer supporting `schema_version = N` **accepts** any manifest
  with `schema_version ≤ N` (older packs keep working — backward
  compatible).
- An importer **rejects** any manifest with `schema_version > N` with a
  clear message: *"This pack was made with a newer version of KnoxKit.
  Please update KnoxKit to import it."* (Conformance fixtures:
  `tests/modpack_fixtures/unknown_schema.json` — `schema_version: 999` —
  must be rejected with that user-facing reason.)
- Unknown **fields** within a supported `schema_version` are ignored, not
  rejected (room for additive, non-breaking growth).

This forward-incompatible-but-clear rule means old KnoxKit never
silently mis-imports a pack that uses features it does not understand.

## 6. Design rationale (locked)

- **Reference by ID, never bundle mod content.** Redistributing Steam
  Workshop content violates the Workshop ToS. Referencing only
  `workshop_id` keeps `.knoxpack` files KB-sized and legal; SteamCMD
  fetches the actual content at import time.
- **`pack_id` stable across versions** — enables "update vs create" (see
  §3).
- **`expected_hash` advisory** — Workshop auto-updates mean the export-time
  hash is a hint, not a contract (see §4).
- **`mod_load_order` ≠ workshop order** — PZ loads by `mod.info` id; one
  Workshop item may contain many mods (see §2.3).
- **`overrides/` whitelisted** — arbitrary file injection is a real attack;
  only config files, never binaries (see §4).
- **Forward-compatible versioning** — reject newer with a clear message,
  never mis-parse (see §5).

## 7. Future roadmap

All of the following are **not in v1** — listed so the format does not
have to break to add them later:

- **Hosted modpack registry** *(not in v1)* — discover/update packs from a
  central or self-hosted index instead of file sharing.
- **Auto-update detection** *(not in v1)* — match `pack_id`, compare
  `version`, offer an in-app update. Needs a registry or per-pack
  check-URL.
- **Ed25519 manifest signing** *(not in v1)* — optional detached signature
  over `knoxpack.json`, key-per-author, to detect tampered packs.
- **Non-Workshop sources** *(not in v1)* — direct URL / GitHub / GameBanana
  items. Different (riskier) download path; makes signing matter more.
- **Cross-platform override paths** *(not in v1)* — current override paths
  assume the Windows game layout. Linux/macOS paths are an open question
  (see `docs/future.md`).
