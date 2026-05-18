//! System info commands: thin arg-parse → service → DTO. No logic here.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `commands::system::get`. The `#[tauri::command]` attribute +
//! noun-verb registration name live on the thin wrapper in `commands/mod.rs`.

use crate::domain::system::Ram;
use crate::error::Result;
use crate::services::system;

/// Read this machine's physical-RAM snapshot for the heap slider.
/// (registered via `commands::get_system_ram`)
///
/// Always succeeds — `services::system::snapshot` degrades to a conservative
/// fallback if the host total is unreadable, so the slider can always render.
pub async fn get() -> Result<Ram> {
    Ok(system::snapshot())
}
