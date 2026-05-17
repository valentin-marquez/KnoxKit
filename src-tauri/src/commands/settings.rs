//! Settings commands: thin arg-parse → service → DTO.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `commands::settings::get`, `commands::settings::update`.
//! `#[tauri::command]` wrappers are in `commands/mod.rs`.
//!
//! Settings persistence is small + local, so it lives here as a thin
//! disk read/merge/write (no dedicated service module is in scope).

use crate::domain::settings::{self, Settings};
use crate::error::Result;
use crate::paths;

/// Read settings, returning [`Settings::default`] if the file is absent.
/// (registered via `commands::get_settings`)
pub async fn get() -> Result<Settings> {
    read_or_default()
}

/// Merge `patch` into the persisted settings and return the new value.
/// (registered via `commands::update_settings`)
pub async fn update(patch: settings::Patch) -> Result<Settings> {
    let mut s = read_or_default()?;
    s.apply(patch);
    let file = paths::settings_file()?;
    paths::ensure_parent(&file)?;
    let tmp = file.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&s)?)?;
    std::fs::rename(&tmp, &file)?;
    Ok(s)
}

/// Read `settings.json`, or the default settings if it does not exist.
fn read_or_default() -> Result<Settings> {
    let file = paths::settings_file()?;
    if !file.exists() {
        return Ok(Settings::default());
    }
    let bytes = std::fs::read(&file)?;
    let s: Settings = serde_json::from_slice(&bytes)?;
    Ok(s)
}
