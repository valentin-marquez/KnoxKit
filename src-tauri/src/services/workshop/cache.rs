//! Shared, deduplicated workshop content cache + per-instance junctions.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `cache::ingest`, `cache::link_into_instance`.
//!
//! A workshop item is downloaded **once** into
//! `%APPDATA%/KnoxKit/cache/workshop/<workshop_id>/` (see
//! `docs/architecture.md`). Each instance that uses it gets a directory
//! **junction** at `instances/<uuid>/workshop/<workshop_id>` pointing into
//! that shared cache, so disk is shared but instances stay logically
//! self-contained.
//!
//! ## Why a junction, not a symlink
//!
//! On Windows, `std::os::windows::fs::symlink_dir` creates a *symbolic
//! link*, which requires either Administrator rights or Developer Mode —
//! KnoxKit must work for a normal user with neither. A **directory
//! junction** (`mklink /J`) is a reparse point that needs **no elevated
//! privilege** and behaves like a transparent directory for the game. We
//! therefore shell out to `cmd /C mklink /J` rather than use the std
//! symlink API. This is intentionally Windows-only (the bootstrap targets
//! Windows 10/11 only — see `docs/architecture.md`).

use std::path::{Path, PathBuf};

use crate::error::{Error, Result};
use crate::paths;

/// Move the freshly-downloaded SteamCMD content for `workshop_id` into the
/// shared dedup cache and return the cache path
/// (`cache/workshop/<workshop_id>/`).
///
/// `steamcmd_content_dir` is SteamCMD's content root for app 108600
/// (`<steamcmd>/steamapps/workshop/content/108600`); the freshly downloaded
/// tree is its `<workshop_id>/` child.
///
/// Atomicity: the source is renamed onto a temp sibling of the final cache
/// path and then renamed into place (rename is atomic within a volume). If
/// the rename fails because source and destination are on different volumes
/// (`ERROR_NOT_SAME_DEVICE`), it falls back to a recursive copy. An existing
/// cache entry for the same id is replaced (re-download = refresh).
pub fn ingest(steamcmd_content_dir: &Path, workshop_id: u64) -> Result<PathBuf> {
    let src = steamcmd_content_dir.join(workshop_id.to_string());
    if !src.is_dir() {
        return Err(Error::NotFound(format!(
            "downloaded workshop content not found at {}",
            src.display()
        )));
    }

    let cache_root = paths::workshop_cache_dir()?;
    paths::ensure_dir(&cache_root)?;
    let final_dir = cache_root.join(workshop_id.to_string());

    // Replace any stale cache entry: refresh on re-download.
    if final_dir.exists() {
        std::fs::remove_dir_all(&final_dir)?;
    }

    // Stage into a temp sibling, then rename into place.
    let staged = cache_root.join(format!(".{workshop_id}.tmp"));
    if staged.exists() {
        std::fs::remove_dir_all(&staged)?;
    }

    match std::fs::rename(&src, &staged) {
        Ok(()) => {}
        Err(_) => {
            // Cross-volume (or otherwise non-renamable): recursive copy.
            copy_dir(&src, &staged)?;
            std::fs::remove_dir_all(&src)?;
        }
    }

    std::fs::rename(&staged, &final_dir)?;
    Ok(final_dir)
}

/// Ensure `instances/<instance_id>/workshop/<workshop_id>` is a directory
/// junction pointing at the shared cache dir for `workshop_id`.
///
/// Idempotent: if the link already exists and resolves to the cache path,
/// this is a no-op; a stale entry (different target, or a real directory)
/// is removed and recreated. Uses a Windows directory junction — see the
/// module doc for the no-elevation rationale.
pub fn link_into_instance(workshop_id: u64, instance_id: &str) -> Result<()> {
    let target = paths::workshop_cache_dir()?.join(workshop_id.to_string());
    if !target.is_dir() {
        return Err(Error::NotFound(format!(
            "cache target missing for workshop {workshop_id}: {}",
            target.display()
        )));
    }

    let link_parent = paths::instances_dir()?
        .join(instance_id)
        .join("workshop");
    paths::ensure_dir(&link_parent)?;
    let link = link_parent.join(workshop_id.to_string());

    if link.exists() {
        // If it already resolves to the right place, nothing to do.
        if let Ok(canon_link) = std::fs::canonicalize(&link)
            && let Ok(canon_target) = std::fs::canonicalize(&target)
            && canon_link == canon_target
        {
            return Ok(());
        }
        // Stale entry: a junction reads as a dir, so remove_dir_all clears
        // both a real directory and a reparse point.
        if link.is_dir() {
            std::fs::remove_dir_all(&link)?;
        } else {
            std::fs::remove_file(&link)?;
        }
    }

    let status = std::process::Command::new("cmd")
        .args([
            "/C",
            "mklink",
            "/J",
            &link.to_string_lossy(),
            &target.to_string_lossy(),
        ])
        .status()
        .map_err(|e| Error::Io(std::io::Error::other(format!("failed to run mklink: {e}"))))?;
    if !status.success() {
        return Err(Error::Steamcmd(format!(
            "mklink /J failed (exit {:?}) creating junction {} -> {}",
            status.code(),
            link.display(),
            target.display()
        )));
    }
    Ok(())
}

/// Recursively copy `from` into `to` (cross-volume `ingest` fallback).
fn copy_dir(from: &Path, to: &Path) -> Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let src = entry.path();
        let dst = to.join(entry.file_name());
        if src.is_dir() {
            copy_dir(&src, &dst)?;
        } else {
            std::fs::copy(&src, &dst)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    /// Build a fake SteamCMD content dir holding one downloaded item with a
    /// nested `mods/<Name>/mod.info`, returning the content root.
    fn fake_download(root: &Path, workshop_id: u64) -> PathBuf {
        let item = root.join(workshop_id.to_string());
        let modinfo_dir = item.join("mods").join("SomeMod");
        std::fs::create_dir_all(&modinfo_dir).expect("mkdir");
        std::fs::write(modinfo_dir.join("mod.info"), "name=Some\nid=SomeMod\n")
            .expect("write mod.info");
        root.to_path_buf()
    }

    #[test]
    fn ingest_moves_content_into_cache() {
        let _guard = paths::TEST_ENV_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        // SAFETY: TEST_ENV_LOCK serializes env-var mutating tests.
        unsafe {
            std::env::set_var(paths::DATA_DIR_ENV, tmp.path());
        }
        let content_root = tmp.path().join("steamcmd_content");
        std::fs::create_dir_all(&content_root).expect("mkdir content");
        fake_download(&content_root, 12345);

        let cached = ingest(&content_root, 12345).expect("ingest");
        assert!(cached.is_dir(), "cache dir should exist");
        assert!(
            cached.join("mods").join("SomeMod").join("mod.info").exists(),
            "mod.info should have moved into the cache"
        );
        assert!(
            !content_root.join("12345").exists(),
            "source should have been moved out"
        );

        unsafe {
            std::env::remove_var(paths::DATA_DIR_ENV);
        }
    }

    #[test]
    fn ingest_replaces_stale_cache_entry() {
        let _guard = paths::TEST_ENV_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        unsafe {
            std::env::set_var(paths::DATA_DIR_ENV, tmp.path());
        }
        let content_root = tmp.path().join("steamcmd_content");
        std::fs::create_dir_all(&content_root).expect("mkdir content");

        // First ingest.
        fake_download(&content_root, 7);
        let cached = ingest(&content_root, 7).expect("ingest 1");
        std::fs::write(cached.join("stale.txt"), "old").expect("write stale");

        // Second ingest of fresh content must drop the stale file.
        fake_download(&content_root, 7);
        let cached2 = ingest(&content_root, 7).expect("ingest 2");
        assert_eq!(cached, cached2);
        assert!(
            !cached2.join("stale.txt").exists(),
            "stale file from prior ingest must be gone"
        );

        unsafe {
            std::env::remove_var(paths::DATA_DIR_ENV);
        }
    }

    #[test]
    fn ingest_missing_source_is_not_found() {
        let _guard = paths::TEST_ENV_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        unsafe {
            std::env::set_var(paths::DATA_DIR_ENV, tmp.path());
        }
        let content_root = tmp.path().join("steamcmd_content");
        std::fs::create_dir_all(&content_root).expect("mkdir");
        let err = ingest(&content_root, 999).expect_err("missing source");
        assert!(matches!(err, Error::NotFound(_)));
        unsafe {
            std::env::remove_var(paths::DATA_DIR_ENV);
        }
    }

    #[test]
    fn link_into_instance_creates_junction_idempotently() {
        let _guard = paths::TEST_ENV_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        unsafe {
            std::env::set_var(paths::DATA_DIR_ENV, tmp.path());
        }
        let content_root = tmp.path().join("steamcmd_content");
        std::fs::create_dir_all(&content_root).expect("mkdir content");
        fake_download(&content_root, 4242);
        ingest(&content_root, 4242).expect("ingest");

        // First link.
        link_into_instance(4242, "inst-abc").expect("link 1");
        let link = paths::instances_dir()
            .expect("instances dir")
            .join("inst-abc")
            .join("workshop")
            .join("4242");
        assert!(link.exists(), "junction should exist");
        assert!(
            link.join("mods").join("SomeMod").join("mod.info").exists(),
            "junction should resolve into the cache content"
        );

        // Second link is a no-op (idempotent), not an error.
        link_into_instance(4242, "inst-abc").expect("link 2 idempotent");

        unsafe {
            std::env::remove_var(paths::DATA_DIR_ENV);
        }
    }

    #[test]
    fn link_into_instance_missing_cache_is_not_found() {
        let _guard = paths::TEST_ENV_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        unsafe {
            std::env::set_var(paths::DATA_DIR_ENV, tmp.path());
        }
        let err = link_into_instance(123456, "inst-x").expect_err("no cache");
        assert!(matches!(err, Error::NotFound(_)));
        unsafe {
            std::env::remove_var(paths::DATA_DIR_ENV);
        }
    }
}
