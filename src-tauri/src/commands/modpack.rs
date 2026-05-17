//! Modpack commands: thin arg-parse → service → DTO.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `commands::modpack::export`, `commands::modpack::import`,
//! `commands::modpack::validate`. `#[tauri::command]` wrappers are in
//! `commands/mod.rs`.

use std::io::Read;

use crate::domain::modpack::Manifest;
use crate::error::{Error, Result};
use crate::services::modpack::{export as export_svc, import as import_svc, manifest};

/// Export an instance to a knoxpack archive.
/// (registered via `commands::export_modpack`)
pub async fn export(instance_id: String, output_path: String) -> Result<()> {
    export_svc::run(&instance_id, &output_path)
}

/// Import a knoxpack archive as a new instance; returns the new id.
/// (registered via `commands::import_modpack`)
pub async fn import(pack_path: String, target_name: String) -> Result<String> {
    import_svc::run(&pack_path, &target_name)
}

/// Validate a knoxpack archive's manifest WITHOUT creating an instance.
/// (registered via `commands::validate_modpack`)
pub async fn validate(pack_path: String) -> Result<Manifest> {
    let file = std::fs::File::open(&pack_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let mut entry = archive
        .by_name("knoxpack.json")
        .map_err(|_| Error::Modpack("archive has no knoxpack.json".into()))?;
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes)?;
    let m = manifest::parse(&bytes)?;
    manifest::validate(&m)?;
    Ok(m)
}
