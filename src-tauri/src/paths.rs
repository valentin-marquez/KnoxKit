//! Filesystem path resolution for KnoxKit application data.
//!
//! keep names path-relative — see docs/conventions.md
//!
//! Every path is rooted at the application data directory. That root is:
//!   1. `$KNOXKIT_DATA_DIR` if the env var is set (the **test-injection hook** —
//!      tests point this at a `tempfile::TempDir` so they never pollute the
//!      real AppData directory), otherwise
//!   2. the platform data dir from `ProjectDirs::from("dev","nozzdev","KnoxKit")`.
//!
//! Parent directories are created lazily by [`ensure_dir`], which writers must
//! call before persisting — nothing is created at import time.

use std::path::PathBuf;

use directories::ProjectDirs;

use crate::error::{Error, Result};

/// Environment variable that overrides the application data directory.
/// Used by the test suite to redirect IO into a temporary directory.
pub const DATA_DIR_ENV: &str = "KNOXKIT_DATA_DIR";

/// Process-global lock serializing tests that mutate `KNOXKIT_DATA_DIR`.
///
/// `KNOXKIT_DATA_DIR` is process-wide, so disk/modpack tests that point it at
/// their own temp dir must not run concurrently. Test helpers acquire this.
#[cfg(test)]
pub static TEST_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Root application data directory.
///
/// Honors `$KNOXKIT_DATA_DIR` first (test hook), then falls back to the
/// platform project data directory.
pub fn app_data_dir() -> Result<PathBuf> {
    if let Ok(dir) = std::env::var(DATA_DIR_ENV)
        && !dir.is_empty()
    {
        return Ok(PathBuf::from(dir));
    }
    let proj = ProjectDirs::from("dev", "nozzdev", "KnoxKit")
        .ok_or_else(|| Error::NotFound("could not resolve OS project directories".into()))?;
    Ok(proj.data_dir().to_path_buf())
}

/// Directory holding every instance folder.
pub fn instances_dir() -> Result<PathBuf> {
    Ok(app_data_dir()?.join("instances"))
}

/// General-purpose cache directory.
pub fn cache_dir() -> Result<PathBuf> {
    Ok(app_data_dir()?.join("cache"))
}

/// Directory where downloaded workshop items are cached.
pub fn workshop_cache_dir() -> Result<PathBuf> {
    Ok(cache_dir()?.join("workshop"))
}

/// Path to the global settings file.
pub fn settings_file() -> Result<PathBuf> {
    Ok(app_data_dir()?.join("settings.json"))
}

/// Path to the instance index file.
pub fn index_file() -> Result<PathBuf> {
    Ok(instances_dir()?.join("index.json"))
}

/// Create `dir` (and all parents) if missing. Writers call this lazily; it is
/// never invoked at import time.
pub fn ensure_dir(dir: &std::path::Path) -> Result<()> {
    std::fs::create_dir_all(dir)?;
    Ok(())
}

/// Ensure the parent directory of `file` exists, then return `file` unchanged.
pub fn ensure_parent(file: &std::path::Path) -> Result<()> {
    if let Some(parent) = file.parent() {
        ensure_dir(parent)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn env_override_is_honored() {
        let _guard = TEST_ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        // SAFETY: TEST_ENV_LOCK serializes all env-var mutating tests.
        unsafe {
            std::env::set_var(DATA_DIR_ENV, tmp.path());
        }
        let root = app_data_dir().expect("app data dir");
        assert_eq!(root, tmp.path());
        assert_eq!(instances_dir().expect("inst"), tmp.path().join("instances"));
        unsafe {
            std::env::remove_var(DATA_DIR_ENV);
        }
    }
}
