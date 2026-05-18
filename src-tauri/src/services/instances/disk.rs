//! Instance persistence: disk is the single source of truth.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `disk::list`, `disk::read`, `disk::create`, `disk::delete`.
//!
//! Synchronous `std::fs` is intentional — async adds nothing for small local
//! JSON files. Every write is atomic (temp file + rename) and the
//! `index.json` summary is rewritten after each mutation.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::domain::instance::{self, GameVersion, Instance};
use crate::domain::mod_collection::Collection;
use crate::error::{Error, Result};
use crate::paths;

/// One row in `index.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexEntry {
    /// Instance id.
    pub id: String,
    /// Instance name.
    pub name: String,
    /// Absolute folder path.
    pub path: String,
    /// Last-played RFC3339 timestamp, if any.
    pub last_played: Option<String>,
}

/// The on-disk instance index.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Index {
    /// All known instances (summary form).
    pub instances: Vec<IndexEntry>,
}

/// Atomically write `bytes` to `path` (write `<path>.tmp` then rename).
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    paths::ensure_parent(path)?;
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// Path to a single instance's folder.
fn instance_dir(id: &str) -> Result<PathBuf> {
    Ok(paths::instances_dir()?.join(id))
}

/// Path to a single instance's `instance.json`.
fn instance_file(id: &str) -> Result<PathBuf> {
    Ok(instance_dir(id)?.join("instance.json"))
}

/// Read and return every instance found on disk.
pub fn list() -> Result<Vec<Instance>> {
    let dir = paths::instances_dir()?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().to_string();
        match read(&id) {
            Ok(inst) => out.push(inst),
            Err(e) => tracing::warn!("skipping unreadable instance {id}: {e}"),
        }
    }
    out.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(out)
}

/// Read a single instance by id.
///
/// Disk is the only source of truth, so migration is **lazy and on the read
/// path**: if the file is `schema_version == 1` it is mapped to v2 in memory
/// and **atomically rewritten** as v2 before being returned (consistent with
/// the `index.json` rebuild-from-folders philosophy — no one-shot pass, no
/// migration command). A current-schema file deserializes directly.
pub fn read(id: &str) -> Result<Instance> {
    let file = instance_file(id)?;
    if !file.exists() {
        return Err(Error::NotFound(format!("instance {id}")));
    }
    let bytes = std::fs::read(&file)?;

    // Peek at `schema_version` without committing to the v2 shape: a v1 file
    // still has `game_version: String` and lacks the new fields, so a direct
    // `from_slice::<Instance>` would fail.
    let raw: serde_json::Value = serde_json::from_slice(&bytes)?;
    let version = raw.get("schema_version").and_then(|v| v.as_u64());

    if version == Some(u64::from(instance::SCHEMA_VERSION)) {
        let inst: Instance = serde_json::from_value(raw)?;
        return Ok(inst);
    }

    if version == Some(1) {
        let inst = migrate_v1(&raw)?;
        // Persist the upgrade so the disk stays the source of truth.
        atomic_write(&file, serde_json::to_vec_pretty(&inst)?.as_slice())?;
        return Ok(inst);
    }

    Err(Error::Validation(format!(
        "instance {id}: unsupported schema_version {version:?} (expected 1 or {})",
        instance::SCHEMA_VERSION
    )))
}

/// Map a `schema_version == 1` instance JSON value to a v2 [`Instance`].
///
/// The only structural change is `game_version: String` →
/// [`instance::GameVersion`] via [`GameVersion::parse_loose`]; every new field
/// becomes `None`. Unknown/missing v1 fields fall back to sane defaults rather
/// than failing the whole read (a half-written v1 file should still migrate).
fn migrate_v1(raw: &serde_json::Value) -> Result<Instance> {
    let str_field = |k: &str| raw.get(k).and_then(|v| v.as_str()).map(str::to_string);
    let id = str_field("id").ok_or_else(|| Error::Validation("v1 instance missing id".into()))?;
    let name = str_field("name").unwrap_or_default();
    let old_game_version = str_field("game_version").unwrap_or_default();
    let jvm_args = raw
        .get("jvm_args")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    let created_at = str_field("created_at").unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let last_played = str_field("last_played");
    let path = str_field("path").unwrap_or_default();

    Ok(Instance {
        schema_version: instance::SCHEMA_VERSION,
        id,
        name,
        game_version: GameVersion::parse_loose(&old_game_version),
        jvm_args,
        created_at,
        last_played,
        path,
        max_ram_mb: None,
        icon_path: None,
        description: None,
        author: None,
        pack_version: None,
        pack_id: None,
        source: None,
    })
}

/// Create a new instance folder and persist it. Updates `index.json`.
pub fn create(input: instance::Input) -> Result<Instance> {
    let id = uuid::Uuid::new_v4().to_string();
    let dir = instance_dir(&id)?;
    paths::ensure_dir(&dir)?;
    paths::ensure_dir(&dir.join("saves"))?;
    paths::ensure_dir(&dir.join("workshop"))?;

    let inst = Instance {
        schema_version: instance::SCHEMA_VERSION,
        id: id.clone(),
        name: input.name,
        game_version: input.game_version,
        jvm_args: input.jvm_args,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_played: None,
        path: dir.to_string_lossy().to_string(),
        max_ram_mb: input.max_ram_mb,
        icon_path: input.icon_path,
        description: input.description,
        author: input.author,
        pack_version: input.pack_version,
        pack_id: input.pack_id,
        source: input.source,
    };

    atomic_write(
        &instance_file(&id)?,
        serde_json::to_vec_pretty(&inst)?.as_slice(),
    )?;
    // Seed an empty mods.json.
    let empty = Collection::empty(id.clone());
    atomic_write(
        &dir.join("mods.json"),
        serde_json::to_vec_pretty(&empty)?.as_slice(),
    )?;

    rebuild_index()?;
    Ok(inst)
}

/// Delete an instance folder and update `index.json`.
pub fn delete(id: &str) -> Result<()> {
    let dir = instance_dir(id)?;
    if !dir.exists() {
        return Err(Error::NotFound(format!("instance {id}")));
    }
    std::fs::remove_dir_all(&dir)?;
    rebuild_index()?;
    Ok(())
}

/// Recompute and atomically rewrite `index.json` from the instances on disk.
pub fn rebuild_index() -> Result<()> {
    let index = Index {
        instances: list()?
            .into_iter()
            .map(|i| IndexEntry {
                id: i.id,
                name: i.name,
                path: i.path,
                last_played: i.last_played,
            })
            .collect(),
    };
    atomic_write(
        &paths::index_file()?,
        serde_json::to_vec_pretty(&index)?.as_slice(),
    )?;
    Ok(())
}

/// Read an instance's `mods.json`, returning an empty collection if absent.
pub fn read_mods(id: &str) -> Result<Collection> {
    let file = instance_dir(id)?.join("mods.json");
    if !file.exists() {
        return Ok(Collection::empty(id.to_string()));
    }
    let bytes = std::fs::read(&file)?;
    let coll: Collection = serde_json::from_slice(&bytes)?;
    Ok(coll)
}

/// Atomically (over)write an instance's `mods.json` from `coll`.
pub fn write_mods(id: &str, coll: &Collection) -> Result<()> {
    atomic_write(
        &instance_dir(id)?.join("mods.json"),
        serde_json::to_vec_pretty(coll)?.as_slice(),
    )
}

/// Stamp an instance's `last_played` with the current UTC time (RFC3339) and
/// persist it. Atomic write of `instance.json`, then `index.json` is rebuilt
/// so the fast-lookup cache stays in step with the folders (disk is the only
/// source of truth — see docs/architecture.md).
pub fn touch_last_played(id: &str) -> Result<()> {
    let mut inst = read(id)?;
    inst.last_played = Some(chrono::Utc::now().to_rfc3339());
    atomic_write(
        &instance_file(id)?,
        serde_json::to_vec_pretty(&inst)?.as_slice(),
    )?;
    rebuild_index()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    /// Run `f` with `KNOXKIT_DATA_DIR` pointed at a fresh temp dir.
    ///
    /// Serialized against all other env-mutating tests via
    /// [`paths::TEST_ENV_LOCK`] because the env var is process-global.
    fn with_temp_data<T>(f: impl FnOnce() -> T) -> T {
        let _guard = paths::TEST_ENV_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        // SAFETY: the lock above guarantees no other test mutates this env
        // var concurrently for the duration of `f`.
        unsafe {
            std::env::set_var(paths::DATA_DIR_ENV, tmp.path());
        }
        let out = f();
        unsafe {
            std::env::remove_var(paths::DATA_DIR_ENV);
        }
        drop(tmp);
        out
    }

    /// Minimal v2 [`instance::Input`] with all optional fields defaulted.
    fn input(name: &str, gv: GameVersion, jvm_args: Vec<String>) -> instance::Input {
        instance::Input {
            name: name.to_string(),
            game_version: gv,
            jvm_args,
            max_ram_mb: None,
            icon_path: None,
            description: None,
            author: None,
            pack_version: None,
            pack_id: None,
            source: None,
        }
    }

    /// `{ branch: Stable, build: Some(b) }` shorthand for tests.
    fn stable(b: &str) -> GameVersion {
        GameVersion {
            branch: instance::Branch::Stable,
            build: Some(b.to_string()),
        }
    }

    #[test]
    fn create_read_list_delete_roundtrip() {
        with_temp_data(|| {
            assert_eq!(list().expect("empty list").len(), 0);
            let inst =
                create(input("Test", stable("41.78"), vec!["-Xmx4g".into()])).expect("create");

            let got = read(&inst.id).expect("read");
            assert_eq!(got, inst);

            let all = list().expect("list");
            assert_eq!(all.len(), 1);

            // index.json exists & has one row.
            let idx_bytes = std::fs::read(paths::index_file().expect("idx")).expect("read idx");
            let idx: Index = serde_json::from_slice(&idx_bytes).expect("parse idx");
            assert_eq!(idx.instances.len(), 1);
            assert_eq!(idx.instances[0].id, inst.id);

            // v2 fields default to None and round-trip.
            assert_eq!(inst.schema_version, instance::SCHEMA_VERSION);
            assert_eq!(inst.max_ram_mb, None);
            assert_eq!(inst.pack_id, None);
            assert_eq!(inst.source, None);

            delete(&inst.id).expect("delete");
            assert_eq!(list().expect("list after delete").len(), 0);
        });
    }

    #[test]
    fn v1_instance_migrates_to_v2_and_is_rewritten() {
        with_temp_data(|| {
            let id = "11111111-1111-4111-8111-111111111111";
            let dir = instance_dir(id).expect("dir");
            paths::ensure_dir(&dir).expect("mkdir");
            // A hand-written v1 file: free `game_version` string, no new fields.
            let v1 = serde_json::json!({
                "schema_version": 1,
                "id": id,
                "name": "Legacy",
                "game_version": "41.78.16",
                "jvm_args": ["-Xmx6g"],
                "created_at": "2024-01-01T00:00:00+00:00",
                "last_played": null,
                "path": dir.to_string_lossy(),
            });
            std::fs::write(
                instance_file(id).expect("file"),
                serde_json::to_vec_pretty(&v1).expect("ser v1"),
            )
            .expect("write v1");

            let got = read(id).expect("read migrates");
            assert_eq!(got.schema_version, 2);
            assert_eq!(
                got.game_version,
                GameVersion {
                    branch: instance::Branch::Stable,
                    build: Some("41.78.16".into()),
                }
            );
            assert_eq!(got.jvm_args, vec!["-Xmx6g".to_string()]);
            assert_eq!(got.max_ram_mb, None);
            assert_eq!(got.pack_id, None);

            // The file on disk was rewritten as v2 (disk is the truth).
            let raw = std::fs::read(instance_file(id).expect("file")).expect("reread");
            let val: serde_json::Value = serde_json::from_slice(&raw).expect("parse");
            assert_eq!(val["schema_version"], 2);
            assert_eq!(val["game_version"]["branch"], "Stable");
            assert_eq!(val["game_version"]["build"], "41.78.16");
            // And it now deserializes straight into the v2 type.
            let direct: Instance = serde_json::from_slice(&raw).expect("v2 parse");
            assert_eq!(direct, got);
        });
    }

    #[test]
    fn v1_beta_string_migrates_to_unstable_branch() {
        with_temp_data(|| {
            let id = "22222222-2222-4222-8222-222222222222";
            let dir = instance_dir(id).expect("dir");
            paths::ensure_dir(&dir).expect("mkdir");
            let v1 = serde_json::json!({
                "schema_version": 1,
                "id": id,
                "name": "Beta",
                "game_version": "beta",
                "jvm_args": [],
                "created_at": "2024-01-01T00:00:00+00:00",
                "last_played": null,
                "path": dir.to_string_lossy(),
            });
            std::fs::write(
                instance_file(id).expect("file"),
                serde_json::to_vec_pretty(&v1).expect("ser"),
            )
            .expect("write");

            let got = read(id).expect("read migrates");
            assert_eq!(
                got.game_version,
                GameVersion {
                    branch: instance::Branch::Unstable,
                    build: None,
                }
            );
        });
    }

    #[test]
    fn read_missing_is_not_found() {
        with_temp_data(|| {
            let err = read("does-not-exist").expect_err("should be missing");
            assert!(matches!(err, Error::NotFound(_)));
        });
    }

    #[test]
    fn mods_default_write_readback_roundtrip() {
        use crate::domain::mod_collection::{Collection, ModEntry};

        with_temp_data(|| {
            let inst = create(input("Mods", stable("41.78"), Vec::new())).expect("create");

            // Default seeded mods.json reads back as an empty collection.
            let default = read_mods(&inst.id).expect("read default mods");
            assert_eq!(default, Collection::empty(inst.id.clone()));

            // Mutate and persist.
            let coll = Collection {
                instance_id: inst.id.clone(),
                workshop_ids: vec![2392709985, 262584809],
                mods: vec![ModEntry {
                    workshop_id: 2392709985,
                    mod_ids: vec!["Brita".into()],
                    enabled: true,
                }],
                mod_load_order: vec!["Brita".into()],
            };
            write_mods(&inst.id, &coll).expect("write mods");

            // Read-back is structurally identical.
            let got = read_mods(&inst.id).expect("read back mods");
            assert_eq!(got, coll);
        });
    }

    #[test]
    fn touch_last_played_stamps_instance_and_index() {
        with_temp_data(|| {
            let inst = create(input("Played", stable("41.78"), Vec::new())).expect("create");
            assert_eq!(inst.last_played, None);

            touch_last_played(&inst.id).expect("touch");

            // instance.json now carries a parseable RFC3339 timestamp.
            let got = read(&inst.id).expect("read after touch");
            let stamp = got.last_played.expect("last_played set");
            chrono::DateTime::parse_from_rfc3339(&stamp).expect("valid rfc3339");

            // index.json mirrors the new last_played.
            let idx_bytes = std::fs::read(paths::index_file().expect("idx")).expect("read idx");
            let idx: Index = serde_json::from_slice(&idx_bytes).expect("parse idx");
            assert_eq!(idx.instances.len(), 1);
            assert_eq!(
                idx.instances[0].last_played.as_deref(),
                Some(stamp.as_str())
            );
        });
    }

    #[test]
    fn touch_last_played_missing_is_not_found() {
        with_temp_data(|| {
            let err = touch_last_played("nope").expect_err("missing instance");
            assert!(matches!(err, Error::NotFound(_)));
        });
    }
}
