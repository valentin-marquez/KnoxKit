# KnoxKit v2 — Conventions

> This is what PR review comments link to. Two parts: (1) the naming
> convention, (2) the commit convention. Both are enforced — naming by
> review, commits by `commitlint` in CI.

---

## Part 1 — "The path is the namespace"

### The rule

**An identifier never repeats the name of its containing module or file.**
The import path already supplies the context, so re-stating it in the name
is noise. Read the name *at the call site*, where the path is visible.

- `storage/adapter.ts` exports `Adapter` (not `StorageAdapter`) → at the
  call site it reads `storage.Adapter`.
- `domain/instance.rs` exports `Instance`, `Input`, `Id` → call sites read
  `instance::Instance`, `instance::Input`, `instance::Id`.

The path *is* the namespace. `StorageAdapter` imported from
`storage/adapter` is `storage.StorageAdapter` — the `Storage` is said
twice.

### TypeScript example table

| File | Exports | Read at call site |
|---|---|---|
| `src/types/instance.ts` | `Instance`, `Input`, `Id`, `Status` | `instance.Instance`, `instance.Input` |
| `src/types/modpack.ts` | `Modpack`, `Manifest`, `WorkshopItem` | `modpack.Manifest`, `modpack.WorkshopItem` |
| `src/types/events.ts` | `SteamcmdProgress`, `Name` | `events.SteamcmdProgress` |
| `src/lib/tauri/commands.ts` | `listInstances`, `createInstance`, `importModpack` | `commands.listInstances` |
| `src/stores/ui-store.ts` | `useStore` (or `use`) | `uiStore.useStore` |
| `src/components/modpack/import-preview.tsx` | `ImportPreview` | `<ImportPreview />` |

### Rust example table

| File | Exports | Read at call site |
|---|---|---|
| `src-tauri/src/domain/instance.rs` | `Instance`, `Input`, `Id` | `instance::Instance` |
| `src-tauri/src/domain/modpack.rs` | `Modpack`, `Manifest`, `WorkshopItem` | `modpack::Manifest` |
| `src-tauri/src/services/steamcmd/parser.rs` | `Event`, `parse_line` | `parser::Event`, `parser::parse_line` |
| `src-tauri/src/services/steamcmd/worker.rs` | `Worker`, `Handle` | `worker::Worker` |
| `src-tauri/src/services/steamcmd/job.rs` | `Job`, `Id` | `job::Job`, `job::Id` |
| `src-tauri/src/services/instances/disk.rs` | `load`, `save`, `Error` | `disk::load`, `disk::save` |
| `src-tauri/src/services/modpack/manifest.rs` | `read`, `write`, `validate` | `manifest::read` |
| `src-tauri/src/commands/instances.rs` | `list_instances`, `create_instance` | (registered as Tauri commands) |
| `src-tauri/src/error.rs` | `Error`, `Result` | re-exported at crate root |
| `src-tauri/src/events.rs` | `SteamcmdProgress`, `Name` | `events::SteamcmdProgress` |

### Locked exceptions

1. **Tauri command registration names get full noun-verb form.**
   `export_modpack`, `list_instances`, `create_instance`. They cross the
   IPC boundary into JS where there is no path context, so they must be
   self-describing globally.
2. **React component file → component name may match.**
   `import-preview.tsx` → `ImportPreview`. JSX usage (`<ImportPreview />`)
   has no module-path prefix, so a descriptive standalone name is correct.
3. **Crate-root re-exports are encouraged.** `pub use error::Error;` so
   the rest of the crate writes `crate::Error`. The re-export, not the
   definition site, owns the short path.
4. **JS/TS command-module functions keep verb-noun shape.**
   `listInstances`, not `list`. JavaScript has no path-at-call-site like
   `commands::list`, so the function name carries the verb itself.

### Collision rule

If two imports would collide, **alias at the import site** or **import the
parent module** and qualify. **Never rename at the export site** to dodge
a collision — the export name is canonical; consumers adapt.

```ts
// good — alias at import
import { Instance as InstanceType } from "@/types/instance";
// good — import parent, qualify
import * as instance from "@/types/instance";
//   instance.Instance
// bad — renaming the export to InstanceModel just so it does not collide
```

```rust
// good
use crate::domain::instance::{self, Instance};
use crate::domain::modpack::{self};        // then modpack::Manifest
// good — explicit alias on genuine clash
use crate::domain::instance::Id as InstanceId;
// bad — defining `pub struct InstanceModel` in instance.rs to avoid a clash
```

---

## Part 2 — Conventional Commits (strict, 1.0)

Enforced by `commitlint.config.js` in CI (the `commitlint` job, PR only).

### Format

```
<type>(<scope>): <subject>

<body>            # optional; blank line above; wrapped at 72; explains WHY

<footer>          # optional; BREAKING CHANGE: ... / Refs: #123
```

- **`<type>`** — lowercase, one of:
  `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`,
  `ci`, `style`.
- **`<scope>`** — optional, kebab-case, **exactly one**. Allowed scopes:
  `backend`, `frontend`, `modpack`, `steamcmd`, `ci`, `deps`, `docs`.
  Needing multiple scopes means the commit is too big — **split it**.
- **`<subject>`** — imperative mood ("add", not "added"/"adds"), **no
  trailing period**, **≤ 72 chars** (the whole header is capped at 72).
- **`<body>`** — optional. Blank line first. Wrapped at 72 columns.
  Explains *why*, not *what* (the diff shows *what*).
- **`<footer>`** — optional. `BREAKING CHANGE: <description>` and/or
  `Refs: #123`. A breaking change **also** adds `!` before the colon:
  `feat(modpack)!: drop schema_version 0 support`.

### Good

```
feat(modpack): add knoxpack export and import roundtrip
fix(steamcmd): restart child on EOF instead of hanging
chore(deps): bump tauri to 2.1.0
docs(architecture): document instance folder layout
refactor(commands): split instances.rs by operation
test(parser): cover login retry fixture
feat(modpack)!: require schema_version 1, reject legacy packs
```

### Bad — and why

| Bad | Why it fails |
|---|---|
| `Updated stuff` | no type, vague, past tense |
| `feat: Added the new modpack feature.` | past tense, capitalized subject, trailing period |
| `WIP` | no type, no subject |
| `feat(modpack, steamcmd, ci): big PR` | multi-scope = commit too big, split it |
| `Fix(steamcmd): handle eof` | type must be lowercase |
| `feat(Backend): add command` | scope must be kebab/lower-case |
