//! Branch-discovery command: thin delegate → service. No logic here.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `commands::branches::list`. The `#[tauri::command]` attribute
//! and the noun-verb registration name (`list_branches`) live on the thin
//! wrapper in `commands/mod.rs`.

use crate::domain::branch;
use crate::error::Result;
use crate::services::steamcmd::appinfo;

/// List the Project Zomboid Steam branches.
/// (registered via `commands::list_branches`)
///
/// Never errors the UI: `appinfo::list_branches` already degrades to the
/// static fallback on any failure, so this always resolves to a non-empty
/// `Ok(...)`.
pub async fn list() -> Result<Vec<branch::Info>> {
    Ok(appinfo::list_branches().await)
}
