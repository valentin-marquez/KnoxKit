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
    // The manifest carries `game_version` as a display string; parse it
    // best-effort back into the structured value. Identity fields pass
    // through so an exported→imported instance keeps its pack identity.
    // The icon (if present) is restored from the archive after creation.
    let inst = disk::create(instance::Input {
        name: target_name.to_string(),
        game_version: instance::GameVersion::parse_loose(&manifest.game_version),
        jvm_args: Vec::new(),
        max_ram_mb: None,
        icon_path: None,
        description: Some(manifest.description.clone()).filter(|s| !s.trim().is_empty()),
        author: Some(manifest.author.clone()).filter(|s| !s.trim().is_empty()),
        pack_version: Some(manifest.version.clone()).filter(|s| !s.trim().is_empty()),
        pack_id: Some(manifest.pack_id.clone()).filter(|s| !s.trim().is_empty()),
        source: Some(instance::Source {
            kind: "knoxpack".to_string(),
            pack_id: manifest.pack_id.clone(),
            pack_version: manifest.version.clone(),
        }),
        icon_source_path: None,
    })?;

    // --- restore the pack icon (lossless roundtrip) ---------------------
    // docs/modpack-format.md §1: optional `icon.png` at the archive root.
    // Read it out and persist it into the new instance folder; a missing
    // icon is simply skipped (the field stays `None`).
    if let Ok(mut entry) = archive.by_name(disk::ICON_FILE) {
        let mut icon_bytes = Vec::new();
        entry.read_to_end(&mut icon_bytes)?;
        drop(entry);
        if !icon_bytes.is_empty() {
            disk::set_icon_bytes(&inst.id, &icon_bytes)?;
        }
    }

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
            instance_id: Some(inst.id.clone()),
        })
        .await
        .map_err(|e| Error::Steamcmd(format!("failed to enqueue download job: {e}")))?;
    }

    Ok(inst.id)
}
