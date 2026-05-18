//! Project Zomboid B41 per-instance mod activation.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `pz::sync_instance_mods`, `pz::render_servertest`.
//!
//! PZ launched with `-cachedir=<instance path>` only discovers mods at
//! `<cachedir>/mods/<modName>/mod.info` and reads its active set + load order
//! from `<cachedir>/Server/servertest.ini`. v2 already junctions each
//! downloaded workshop item into `<instance>/workshop/<workshop_id>/` (see
//! `services::workshop::cache::link_into_instance`); the real mod folders live
//! at `<instance>/workshop/<workshop_id>/mods/<modName>/`.
//!
//! This module makes every ENABLED mod reachable at `<instance>/mods/<modName>`
//! by rebuilding that directory's junctions from `mods.json` on each launch,
//! and (re)writes `servertest.ini` from the same source. Disk stays the only
//! source of truth (see docs/architecture.md): `<instance>/mods/` and
//! `servertest.ini` are derived, idempotently, from `mods.json` every launch.
//!
//! The `mklink /J` helper here intentionally mirrors the one in
//! `services/workshop/cache.rs` (kept duplicated to keep module scopes clean —
//! no shared edit across services). See that module's doc for the
//! no-elevation rationale for directory junctions over symlinks.

use std::path::Path;

use crate::domain::mod_collection::Collection;
use crate::error::{Error, Result};
use crate::services::workshop::modinfo;

/// Render the `servertest.ini` body PZ reads for the active mod set.
///
/// **Pure**: no IO, no async. `mods_line` is the ordered list of in-game mod
/// ids (the `id=` from each `mod.info`); `workshop_ids` is the deduped list of
/// enabled numeric workshop ids. Both are emitted semicolon-separated with no
/// trailing separator.
///
// TODO(review): capture a real PZ Host servertest.ini as a full template and
// merge other keys; for now we own only Mods=/WorkshopItems=.
pub fn render_servertest(mods_line: &[String], workshop_ids: &[u64]) -> String {
    let mods = mods_line.join(";");
    let items = workshop_ids
        .iter()
        .map(u64::to_string)
        .collect::<Vec<_>>()
        .join(";");
    format!("Mods={mods}\nWorkshopItems={items}\n")
}

/// Order the enabled mod ids for the `Mods=` line.
///
/// **Pure**: no IO, no async. Ids appearing in `load_order` come first in that
/// order; ids not in `load_order` are appended afterwards in their original
/// stable order. `load_order` entries that are not enabled are skipped (an id
/// is "enabled" iff present in `enabled_ids`). Duplicates in `enabled_ids` are
/// emitted once (first occurrence wins).
pub fn order_mods(enabled_ids: &[String], load_order: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::with_capacity(enabled_ids.len());
    let mut seen: std::collections::HashSet<&str> = std::collections::HashSet::new();

    for id in load_order {
        if enabled_ids.iter().any(|e| e == id) && seen.insert(id.as_str()) {
            out.push(id.clone());
        }
    }
    for id in enabled_ids {
        if seen.insert(id.as_str()) {
            out.push(id.clone());
        }
    }
    out
}

/// Rebuild `<inst>/mods/` from the enabled mods in `coll` and (re)write
/// `<inst>/Server/servertest.ini`, idempotently, on every launch.
///
/// For each enabled [`ModEntry`], its mods are discovered under
/// `<inst>/workshop/<workshop_id>/` via [`modinfo::scan`] (which walks
/// `*/mod.info`, also covering the fallback where `mod.info` sits at the
/// workshop item root). For every discovered `<modName>` folder a directory
/// junction `<inst>/mods/<modName>` → its real folder is created. A workshop
/// item that has not been downloaded yet is skipped with a `tracing::warn!`
/// (the game still launches isolated). The `Mods=` order follows
/// `coll.mod_load_order`; `WorkshopItems=` is the deduped enabled workshop id
/// set in load-order-derived-then-remaining order.
pub fn sync_instance_mods(inst_path: &Path, coll: &Collection) -> Result<()> {
    let mods_root = inst_path.join("mods");

    // Idempotent reset: we own <inst>/mods/ entirely, so clear it and rebuild
    // from the enabled set. Clearing the directory drops stale junctions
    // (a junction reads as a dir, so remove_dir_all clears reparse points too).
    if mods_root.exists() {
        std::fs::remove_dir_all(&mods_root)?;
    }
    std::fs::create_dir_all(&mods_root)?;

    // mod-folder-name -> real source folder, for junction creation.
    // in-game id collected per workshop item for the Mods= line.
    let mut enabled_workshop_ids: Vec<u64> = Vec::new();
    // ids grouped so we can order by mod_load_order afterwards.
    let mut enabled_mod_ids: Vec<String> = Vec::new();

    for entry in &coll.mods {
        if !entry.enabled {
            continue;
        }
        let item_dir = inst_path
            .join("workshop")
            .join(entry.workshop_id.to_string());
        if !item_dir.is_dir() {
            tracing::warn!(
                "workshop item {} not downloaded yet ({}); skipping for launch",
                entry.workshop_id,
                item_dir.display()
            );
            continue;
        }

        // Discover (modName folder, ModInfo) pairs by walking the workshop
        // item. modinfo::scan returns parsed ModInfo in traversal order; we
        // need the owning folder too, so walk for mod.info paths here.
        let mod_info_files = find_mod_info_files(&item_dir)?;
        if mod_info_files.is_empty() {
            tracing::warn!(
                "workshop item {} has no mod.info under {}; skipping",
                entry.workshop_id,
                item_dir.display()
            );
            continue;
        }

        let mut linked_any = false;
        for info_path in mod_info_files {
            let Some(mod_dir) = info_path.parent() else {
                continue;
            };
            let Some(mod_name) = mod_dir.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            let text = std::fs::read_to_string(&info_path)?;
            let info = modinfo::parse(&text);

            let link = mods_root.join(mod_name);
            if let Err(e) = make_junction(&link, mod_dir) {
                // Per-mod failure must not abort the whole launch.
                tracing::warn!(
                    "failed to junction {} -> {}: {e}",
                    link.display(),
                    mod_dir.display()
                );
                continue;
            }
            linked_any = true;
            if let Some(id) = info.id {
                enabled_mod_ids.push(id);
            } else {
                tracing::warn!(
                    "mod.info at {} has no id=; not adding to Mods=",
                    info_path.display()
                );
            }
        }

        if linked_any {
            enabled_workshop_ids.push(entry.workshop_id);
        }
    }

    let mods_line = order_mods(&enabled_mod_ids, &coll.mod_load_order);
    let workshop_ids = dedup_preserve_order(&enabled_workshop_ids);

    let server_dir = inst_path.join("Server");
    std::fs::create_dir_all(&server_dir)?;
    let ini = render_servertest(&mods_line, &workshop_ids);
    atomic_write(&server_dir.join("servertest.ini"), ini.as_bytes())?;

    // TODO(review): if PZ's JVM fails to scan junctioned mod dirs on a real
    // run, fall back to recursive copy like v1 did.
    Ok(())
}

/// Atomically write `bytes` to `path` (write `<path>.tmp` then rename).
///
/// Mirrors the private `atomic_write` in `instances::disk` — kept local so
/// this module does not reach across into another service's internals.
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// Depth-first collect every file literally named `mod.info` under `dir`.
///
/// `modinfo::scan` parses these but discards the owning path; junction
/// creation needs the folder, so we walk for paths here and reuse the pure
/// `modinfo::parse` on the contents.
fn find_mod_info_files(dir: &Path) -> Result<Vec<std::path::PathBuf>> {
    let mut out = Vec::new();
    collect_mod_info(dir, &mut out)?;
    out.sort();
    Ok(out)
}

/// Recursive helper for [`find_mod_info_files`].
fn collect_mod_info(dir: &Path, out: &mut Vec<std::path::PathBuf>) -> Result<()> {
    let mut entries: Vec<std::path::PathBuf> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    entries.sort();
    for path in entries {
        if path.is_dir() {
            collect_mod_info(&path, out)?;
        } else if path.file_name().and_then(|n| n.to_str()) == Some("mod.info") {
            out.push(path);
        }
    }
    Ok(())
}

/// Create a Windows directory junction `link` → `target`, replacing any stale
/// entry already at `link`.
///
/// Intentionally mirrors `services/workshop/cache.rs`'s `mklink /J` approach
/// (no elevation needed, unlike a symlink — see that module's doc). Kept
/// duplicated rather than shared to keep service module scopes clean.
fn make_junction(link: &Path, target: &Path) -> Result<()> {
    if link.exists() {
        if link.is_dir() {
            std::fs::remove_dir_all(link)?;
        } else {
            std::fs::remove_file(link)?;
        }
    }
    let status = std::process::Command::new("cmd")
        .args([
            "/C",
            "mklink",
            "/J",
            &link.to_string_lossy(),
            &target.to_string_lossy(),
        ])
        .status()
        .map_err(|e| Error::Io(std::io::Error::other(format!("failed to run mklink: {e}"))))?;
    if !status.success() {
        return Err(Error::Steamcmd(format!(
            "mklink /J failed (exit {:?}) creating junction {} -> {}",
            status.code(),
            link.display(),
            target.display()
        )));
    }
    Ok(())
}

/// Dedup `ids` preserving first-seen order.
fn dedup_preserve_order(ids: &[u64]) -> Vec<u64> {
    let mut seen = std::collections::HashSet::new();
    ids.iter().copied().filter(|id| seen.insert(*id)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::mod_collection::ModEntry;
    use pretty_assertions::assert_eq;

    #[test]
    fn render_servertest_joins_with_semicolons_no_trailing() {
        let out = render_servertest(
            &["Brita".to_string(), "AuthenticZ".to_string()],
            &[2392709985, 262584809],
        );
        assert_eq!(
            out,
            "Mods=Brita;AuthenticZ\nWorkshopItems=2392709985;262584809\n"
        );
    }

    #[test]
    fn render_servertest_empty_sets_yield_empty_values() {
        assert_eq!(render_servertest(&[], &[]), "Mods=\nWorkshopItems=\n");
    }

    #[test]
    fn order_mods_follows_load_order_then_appends_extras_stably() {
        let enabled = vec![
            "C".to_string(),
            "A".to_string(),
            "B".to_string(),
            "D".to_string(),
        ];
        let load_order = vec!["A".to_string(), "B".to_string()];
        // A,B from load order; then C,D in original enabled order.
        assert_eq!(order_mods(&enabled, &load_order), vec!["A", "B", "C", "D"]);
    }

    #[test]
    fn order_mods_skips_load_order_ids_that_are_not_enabled() {
        let enabled = vec!["A".to_string()];
        let load_order = vec!["A".to_string(), "Disabled".to_string()];
        assert_eq!(order_mods(&enabled, &load_order), vec!["A"]);
    }

    #[test]
    fn order_mods_dedups_enabled_first_occurrence_wins() {
        let enabled = vec!["A".to_string(), "A".to_string(), "B".to_string()];
        let load_order: Vec<String> = Vec::new();
        assert_eq!(order_mods(&enabled, &load_order), vec!["A", "B"]);
    }

    #[test]
    fn dedup_preserve_order_keeps_first_seen() {
        assert_eq!(dedup_preserve_order(&[3, 1, 3, 2, 1]), vec![3, 1, 2]);
    }

    /// Build `<inst>/workshop/<wid>/mods/<name>/mod.info` with the given id.
    fn seed_workshop_mod(inst: &Path, wid: u64, folder: &str, id: &str) {
        let dir = inst
            .join("workshop")
            .join(wid.to_string())
            .join("mods")
            .join(folder);
        std::fs::create_dir_all(&dir).expect("mkdir mod");
        std::fs::write(dir.join("mod.info"), format!("name={folder}\nid={id}\n"))
            .expect("write mod.info");
    }

    #[test]
    fn sync_instance_mods_junctions_enabled_and_writes_servertest() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let inst = tmp.path();
        seed_workshop_mod(inst, 100, "AlphaMod", "Alpha");
        seed_workshop_mod(inst, 200, "BetaMod", "Beta");

        let coll = Collection {
            instance_id: "i".into(),
            workshop_ids: vec![100, 200],
            mods: vec![
                ModEntry {
                    workshop_id: 100,
                    mod_ids: vec!["Alpha".into()],
                    enabled: true,
                },
                ModEntry {
                    workshop_id: 200,
                    mod_ids: vec!["Beta".into()],
                    enabled: false,
                },
            ],
            mod_load_order: vec!["Alpha".into()],
        };

        sync_instance_mods(inst, &coll).expect("sync");

        // Enabled mod is junctioned and resolves to its mod.info.
        let alpha_link = inst.join("mods").join("AlphaMod");
        assert!(alpha_link.exists(), "AlphaMod junction should exist");
        assert!(
            alpha_link.join("mod.info").exists(),
            "junction should resolve into the workshop content"
        );
        // Disabled mod is NOT linked.
        assert!(
            !inst.join("mods").join("BetaMod").exists(),
            "disabled BetaMod must not be linked"
        );

        let ini = std::fs::read_to_string(inst.join("Server").join("servertest.ini"))
            .expect("read servertest.ini");
        assert_eq!(ini, "Mods=Alpha\nWorkshopItems=100\n");
    }

    #[test]
    fn sync_instance_mods_is_idempotent_and_drops_stale_entries() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let inst = tmp.path();
        seed_workshop_mod(inst, 100, "AlphaMod", "Alpha");

        let coll = Collection {
            instance_id: "i".into(),
            workshop_ids: vec![100],
            mods: vec![ModEntry {
                workshop_id: 100,
                mod_ids: vec!["Alpha".into()],
                enabled: true,
            }],
            mod_load_order: vec!["Alpha".into()],
        };
        sync_instance_mods(inst, &coll).expect("sync 1");

        // Plant a stale junction-managed entry; a second sync must drop it.
        std::fs::create_dir_all(inst.join("mods").join("StaleMod")).expect("mkdir stale");
        sync_instance_mods(inst, &coll).expect("sync 2 idempotent");

        assert!(
            !inst.join("mods").join("StaleMod").exists(),
            "stale entry must be cleared on rebuild"
        );
        assert!(
            inst.join("mods").join("AlphaMod").exists(),
            "AlphaMod must be recreated"
        );
    }

    #[test]
    fn sync_instance_mods_skips_missing_workshop_item_gracefully() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let inst = tmp.path();
        // workshop item 999 is never downloaded.
        let coll = Collection {
            instance_id: "i".into(),
            workshop_ids: vec![999],
            mods: vec![ModEntry {
                workshop_id: 999,
                mod_ids: vec!["Ghost".into()],
                enabled: true,
            }],
            mod_load_order: vec!["Ghost".into()],
        };

        // Must NOT error — the game still launches isolated.
        sync_instance_mods(inst, &coll).expect("sync tolerates missing item");

        let ini = std::fs::read_to_string(inst.join("Server").join("servertest.ini"))
            .expect("read servertest.ini");
        assert_eq!(ini, "Mods=\nWorkshopItems=\n");
    }
}
