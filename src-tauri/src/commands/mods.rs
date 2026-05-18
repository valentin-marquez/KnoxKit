//! Mod collection commands: thin arg-parse → service → DTO.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `commands::mods::list`, `commands::mods::import_collection`,
//! `commands::mods::toggle`. `#[tauri::command]` wrappers are in
//! `commands/mod.rs`.

use crate::domain::mod_collection::{Collection, ModEntry};
use crate::error::{Error, Result};
use crate::services::instances::disk;
use crate::services::steamcmd::{job, worker::JobSender};
use crate::services::workshop::url;

/// List an instance's mod collection. (registered via `commands::list_mods`)
pub async fn list(instance_id: String) -> Result<Collection> {
    disk::read_mods(&instance_id)
}

/// Import a workshop reference into `instance_id`: parse the url/id, record it
/// in `mods.json`, and enqueue a SteamCMD download job.
/// (registered via `commands::import_workshop_collection`)
pub async fn import_collection(
    jobs: JobSender,
    instance_id: String,
    url_or_id: String,
) -> Result<()> {
    let r = url::parse(&url_or_id)?;

    // Record the workshop id in the instance's mods.json (idempotent).
    let mut coll = disk::read_mods(&instance_id)?;
    if !coll.workshop_ids.contains(&r.id) {
        coll.workshop_ids.push(r.id);
    }
    if !coll.mods.iter().any(|m| m.workshop_id == r.id) {
        coll.mods.push(ModEntry {
            workshop_id: r.id,
            mod_ids: Vec::new(),
            enabled: true,
        });
    }
    disk::write_mods(&instance_id, &coll)?;

    // TODO(review): collection fan-out needs Workshop API
    jobs.send(job::Job::DownloadMod {
        workshop_id: r.id,
        instance_id: Some(instance_id.clone()),
    })
    .await
    .map_err(|e| Error::Steamcmd(format!("failed to enqueue download job: {e}")))?;
    Ok(())
}

/// Toggle a mod on/off for an instance, persisting the change to `mods.json`.
/// (registered via `commands::toggle_mod`)
pub async fn toggle(instance_id: String, workshop_id: u64, enabled: bool) -> Result<()> {
    let mut coll = disk::read_mods(&instance_id)?;
    let entry = coll
        .mods
        .iter_mut()
        .find(|m| m.workshop_id == workshop_id)
        .ok_or_else(|| {
            Error::NotFound(format!(
                "workshop {workshop_id} in instance {instance_id} mods"
            ))
        })?;
    entry.enabled = enabled;
    disk::write_mods(&instance_id, &coll)?;
    Ok(())
}
