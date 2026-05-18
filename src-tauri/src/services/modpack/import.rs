//! Import a `.knoxpack` archive into a fresh instance.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `import::run`.

use std::io::Read;

use crate::domain::instance;
use crate::domain::mod_collection::{Collection, ModEntry};
use crate::error::{Error, Result};
use crate::services::instances::disk;
use crate::services::modpack::manifest;
use crate::services::steamcmd::{job, worker::JobSender};

/// Open the knoxpack zip at `pack_path`, validate its manifest, create a new
/// instance named `target_name`, copy only whitelisted overrides, persist the
/// pack's workshop ids into the new instance's `mods.json`, enqueue a SteamCMD
/// download job per workshop item, and return the new instance id.
pub async fn run(jobs: &JobSender, pack_path: &str, target_name: &str) -> Result<String> {
    let file = std::fs::File::open(pack_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    // --- manifest --------------------------------------------------------
    let manifest = {
        let mut entry = archive
            .by_name("knoxpack.json")
            .map_err(|_| Error::Modpack("archive has no knoxpack.json".into()))?;
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        let m = manifest::parse(&bytes)?;
        manifest::validate(&m)?;
        m
    };

    // --- create instance -------------------------------------------------
    let inst = disk::create(instance::Input {
        name: target_name.to_string(),
        game_version: manifest.game_version.clone(),
        jvm_args: Vec::new(),
    })?;

    // --- copy whitelisted overrides only --------------------------------
    let names: Vec<String> = archive.file_names().map(|s| s.to_string()).collect();
    for name in names {
        let Some(rel) = name.strip_prefix("overrides/") else {
            continue;
        };
        if rel.is_empty() {
            continue;
        }
        if !manifest::is_allowed_override(rel) {
            tracing::warn!("rejecting non-whitelisted override in pack: {name}");
            continue;
        }
        let mut entry = archive
            .by_name(&name)
            .map_err(|e| Error::Zip(e.to_string()))?;
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        let dest = std::path::Path::new(&inst.path).join("overrides").join(rel);
        crate::paths::ensure_parent(&dest)?;
        std::fs::write(&dest, &bytes)?;
    }

    // --- persist the pack's workshop ids into the new instance ----------
    let coll = Collection {
        instance_id: inst.id.clone(),
        workshop_ids: manifest
            .workshop_items
            .iter()
            .map(|w| w.workshop_id)
            .collect(),
        mods: manifest
            .workshop_items
            .iter()
            .map(|w| ModEntry {
                workshop_id: w.workshop_id,
                mod_ids: Vec::new(),
                enabled: true,
            })
            .collect(),
        mod_load_order: manifest.mod_load_order.clone(),
    };
    disk::write_mods(&inst.id, &coll)?;

    // --- enqueue a download job per workshop item -----------------------
    for item in &manifest.workshop_items {
        jobs.send(job::Job::DownloadMod {
            workshop_id: item.workshop_id,
        })
        .await
        .map_err(|e| Error::Steamcmd(format!("failed to enqueue download job: {e}")))?;
    }

    Ok(inst.id)
}
