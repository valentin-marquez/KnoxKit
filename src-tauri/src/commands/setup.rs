//! Setup / onboarding commands: thin arg-parse → service → DTO.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `commands::setup::status`, `commands::setup::set_game_path`,
//! etc. `#[tauri::command]` wrappers are in `commands/mod.rs`.
//!
//! No logic here — every fn delegates straight into `services::setup`. The
//! two blocking operations (Steam scan, steamcmd download/extract/bootstrap)
//! are moved off the async runtime via `spawn_blocking`.

use crate::domain::setup::Status;
use crate::error::{Error, Result};
use crate::services::setup;

/// Current onboarding status. (registered via `commands::get_setup_status`)
pub async fn status() -> Result<Status> {
    setup::status()
}

/// Auto-detect the PZ install path (Steam scan; touches the filesystem, so it
/// runs on a blocking thread). (registered via `commands::detect_game_path`)
pub async fn detect_game_path() -> Result<Option<String>> {
    tokio::task::spawn_blocking(setup::detect_game_path)
        .await
        .map_err(|e| Error::NotFound(format!("game-path detection task failed: {e}")))
}

/// Validate + persist the PZ install path.
/// (registered via `commands::set_game_path`)
pub async fn set_game_path(path: String) -> Result<Status> {
    setup::set_game_path(&path)
}

/// Resolve an already-available steamcmd, if any.
/// (registered via `commands::detect_steamcmd`)
pub async fn detect_steamcmd() -> Result<Option<String>> {
    setup::detect_steamcmd()
}

/// Install steamcmd in-app and persist its path. Blocking (network +
/// extraction + bootstrap) → off the async runtime.
/// (registered via `commands::install_steamcmd`)
pub async fn install_steamcmd() -> Result<String> {
    tokio::task::spawn_blocking(setup::install_steamcmd)
        .await
        .map_err(|e| Error::Steamcmd(format!("steamcmd install task panicked: {e}")))?
}
