//! Mod collection commands: thin arg-parse → service → DTO.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `commands::mods::list`, `commands::mods::import_collection`,
//! `commands::mods::toggle`. `#[tauri::command]` wrappers are in
//! `commands/mod.rs`.

use crate::domain::mod_collection::Collection;
use crate::error::Result;
use crate::services::instances::disk;
use crate::services::workshop::url;

/// List an instance's mod collection. (registered via `commands::list_mods`)
pub async fn list(instance_id: String) -> Result<Collection> {
    disk::read_mods(&instance_id)
}

/// Import a workshop collection (parse url/id, enqueue jobs — stubbed).
/// (registered via `commands::import_workshop_collection`)
pub async fn import_collection(instance_id: String, url_or_id: String) -> Result<()> {
    let r = url::parse(&url_or_id)?;
    tracing::info!(
        "would enqueue steamcmd jobs for workshop {} into instance {instance_id}",
        r.id
    );
    Ok(())
}

/// Toggle a mod on/off (STUB). (registered via `commands::toggle_mod`)
pub async fn toggle(instance_id: String, workshop_id: u64, enabled: bool) -> Result<()> {
    tracing::info!("would toggle workshop {workshop_id} -> {enabled} for instance {instance_id}");
    Ok(())
}
