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

use crate::domain::instance::{self, Instance};
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
pub fn read(id: &str) -> Result<Instance> {
    let file = instance_file(id)?;
    if !file.exists() {
        return Err(Error::NotFound(format!("instance {id}")));
    }
    let bytes = std::fs::read(&file)?;
    let inst: Instance = serde_json::from_slice(&bytes)?;
    Ok(inst)
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

    #[test]
    fn create_read_list_delete_roundtrip() {
        with_temp_data(|| {
            assert_eq!(list().expect("empty list").len(), 0);
            let inst = create(instance::Input {
                name: "Test".into(),
                game_version: "41.78".into(),
                jvm_args: vec!["-Xmx4g".into()],
            })
            .expect("create");

            let got = read(&inst.id).expect("read");
            assert_eq!(got, inst);

            let all = list().expect("list");
            assert_eq!(all.len(), 1);

            // index.json exists & has one row.
            let idx_bytes = std::fs::read(paths::index_file().expect("idx")).expect("read idx");
            let idx: Index = serde_json::from_slice(&idx_bytes).expect("parse idx");
            assert_eq!(idx.instances.len(), 1);
            assert_eq!(idx.instances[0].id, inst.id);

            delete(&inst.id).expect("delete");
            assert_eq!(list().expect("list after delete").len(), 0);
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
            let inst = create(instance::Input {
                name: "Mods".into(),
                game_version: "41.78".into(),
                jvm_args: Vec::new(),
            })
            .expect("create");

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
}
