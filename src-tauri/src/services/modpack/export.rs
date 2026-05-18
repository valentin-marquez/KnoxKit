//! Export an instance to a `.knoxpack` zip archive.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `export::run`.

use std::io::Write;

use sha2::{Digest, Sha256};
use zip::write::SimpleFileOptions;

use crate::domain::modpack::{Manifest, WorkshopItemRef};
use crate::error::Result;
use crate::paths;
use crate::services::instances::disk;

/// Build a knoxpack manifest + zip for `instance_id`, writing it to
/// `output_path`.
///
/// The archive contains `knoxpack.json` and, if the instance has JVM args, an
/// `overrides/jvm-args.txt` override. Each workshop item's `expected_hash` is
/// the sha256 of its cached zip when present, else `"sha256:unknown"`.
pub fn run(instance_id: &str, output_path: &str) -> Result<()> {
    let inst = disk::read(instance_id)?;
    let mods = disk::read_mods(instance_id)?;

    let workshop_items: Vec<WorkshopItemRef> = mods
        .workshop_ids
        .iter()
        .enumerate()
        .map(|(idx, &wid)| WorkshopItemRef {
            workshop_id: wid,
            display_name: format!("workshop {wid}"),
            required: true,
            expected_hash: hash_cached_workshop(wid),
            load_order: idx as u32,
        })
        .collect();

    // `.knoxpack` keeps `game_version: String` (schema_version stays 1):
    // project the structured value to its display string. Identity fields
    // pass through losslessly when the instance carries them, else fall back
    // to the previous defaults so existing packs are unaffected.
    let manifest = Manifest {
        schema_version: crate::domain::modpack::SCHEMA_VERSION,
        format: crate::domain::modpack::FORMAT.to_string(),
        pack_id: inst
            .pack_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        name: inst.name.clone(),
        version: inst
            .pack_version
            .clone()
            .unwrap_or_else(|| "1.0.0".to_string()),
        author: inst.author.clone().unwrap_or_else(|| "knoxkit".to_string()),
        description: inst
            .description
            .clone()
            .unwrap_or_else(|| format!("Exported from instance {}", inst.name)),
        game_version: inst.game_version.manifest_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        workshop_items,
        mod_load_order: mods.mod_load_order.clone(),
        map_load_order: Vec::new(),
        recommended_sandbox: std::collections::BTreeMap::new(),
    };

    paths::ensure_parent(std::path::Path::new(output_path))?;
    let file = std::fs::File::create(output_path)?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("knoxpack.json", opts)?;
    zip.write_all(serde_json::to_vec_pretty(&manifest)?.as_slice())?;

    if !inst.jvm_args.is_empty() {
        zip.start_file("overrides/jvm-args.txt", opts)?;
        zip.write_all(inst.jvm_args.join("\n").as_bytes())?;
    }

    // Lossless icon roundtrip: if the instance carries an `icon.png`, embed
    // it at the archive root (docs/modpack-format.md §1). The on-disk file is
    // the source of truth — fall back to it rather than trusting only the
    // `icon_path` field, but only emit when both agree and the file exists.
    if inst.icon_path.is_some() {
        let icon = std::path::Path::new(&inst.path).join(disk::ICON_FILE);
        if icon.is_file() {
            let bytes = std::fs::read(&icon)?;
            zip.start_file(disk::ICON_FILE, opts)?;
            zip.write_all(&bytes)?;
        }
    }

    zip.finish()?;
    Ok(())
}

/// sha256 of a cached workshop zip, or `"sha256:unknown"` if not cached.
//
// (Error is reachable via `crate::error::Result` returned above.)
fn hash_cached_workshop(workshop_id: u64) -> String {
    let cache = match paths::workshop_cache_dir() {
        Ok(c) => c.join(format!("{workshop_id}.zip")),
        Err(_) => return "sha256:unknown".to_string(),
    };
    match std::fs::read(&cache) {
        Ok(bytes) => {
            let mut h = Sha256::new();
            h.update(&bytes);
            let digest = h.finalize();
            let mut hex = String::with_capacity(digest.len() * 2);
            for b in digest.iter() {
                hex.push_str(&format!("{b:02x}"));
            }
            format!("sha256:{hex}")
        }
        Err(_) => "sha256:unknown".to_string(),
    }
}
