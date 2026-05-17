//! Workshop commands: thin arg-parse → service → DTO.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `commands::workshop::parse_url`. `#[tauri::command]` wrapper
//! is in `commands/mod.rs`.

use crate::domain::workshop::WorkshopRef;
use crate::error::Result;

/// Parse a workshop url/id into a [`WorkshopRef`].
/// (registered via `commands::parse_workshop_url`)
pub async fn parse_url(input: String) -> Result<WorkshopRef> {
    crate::services::workshop::url::parse(&input)
}
