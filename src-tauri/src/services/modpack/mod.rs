//! Modpack service: manifest parse/validate, export, import.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `modpack::manifest::parse`, `modpack::export::run`,
//! `modpack::import::run`.

pub mod export;
pub mod import;
pub mod manifest;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::instance;
    use crate::domain::mod_collection::Collection;
    use crate::paths;
    use crate::services::instances::disk;
    use pretty_assertions::assert_eq;
    use std::io::Read;

    /// Export an instance with 2 workshop items + a jvm-args override, import
    /// it as a new instance, and assert the manifest survives the roundtrip
    /// and the override file was copied.
    //
    // The std `MutexGuard` is intentionally held across the `import::run`
    // await: the guard serializes the process-global `KNOXKIT_DATA_DIR` env
    // var, which `import::run` reads, so it must stay held for the whole
    // import. `#[tokio::test]` runs this future on a single-threaded runtime,
    // so the guard never crosses a thread boundary.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn export_import_roundtrip_preserves_manifest_and_override() {
        let _guard = paths::TEST_ENV_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        // SAFETY: TEST_ENV_LOCK serializes all env-var mutating tests.
        unsafe {
            std::env::set_var(paths::DATA_DIR_ENV, tmp.path());
        }

        // --- synthesize a source instance -------------------------------
        let inst = disk::create(instance::Input {
            name: "Roundtrip Source".into(),
            game_version: instance::GameVersion {
                branch: instance::Branch::Stable,
                build: Some("41.78.16".into()),
            },
            jvm_args: vec!["-Xmx6g".into(), "-Dzomboid=1".into()],
            max_ram_mb: None,
            icon_path: None,
            description: None,
            author: None,
            pack_version: None,
            pack_id: None,
            source: None,
            icon_source_path: None,
        })
        .expect("create source");

        // Give the source instance an icon so the roundtrip can prove the
        // `.knoxpack` `icon.png` is lossless (export → import → same bytes).
        let icon_src = tmp.path().join("source-icon.png");
        let icon_bytes: &[u8] = b"\x89PNG\r\n\x1a\nFAKE-BUT-DETERMINISTIC-ICON";
        std::fs::write(&icon_src, icon_bytes).expect("write source icon");
        disk::set_icon(&inst.id, &icon_src.to_string_lossy()).expect("set source icon");

        // Give it two workshop ids in mods.json.
        let coll = Collection {
            instance_id: inst.id.clone(),
            workshop_ids: vec![2392709985, 262584809],
            mods: Vec::new(),
            mod_load_order: vec!["Brita".into(), "AuthenticZ".into()],
        };
        let mods_path = std::path::Path::new(&inst.path).join("mods.json");
        std::fs::write(
            &mods_path,
            serde_json::to_vec_pretty(&coll).expect("ser mods"),
        )
        .expect("write mods.json");

        // --- export ------------------------------------------------------
        let pack_path = tmp.path().join("out.knoxpack");
        export::run(&inst.id, &pack_path.to_string_lossy()).expect("export");
        assert!(pack_path.exists(), "pack file should exist");

        // Read the exported manifest for comparison.
        let exported_manifest = {
            let f = std::fs::File::open(&pack_path).expect("open pack");
            let mut a = zip::ZipArchive::new(f).expect("zip");
            let mut e = a.by_name("knoxpack.json").expect("knoxpack.json");
            let mut b = Vec::new();
            e.read_to_end(&mut b).expect("read manifest");
            manifest::parse(&b).expect("parse exported")
        };

        // --- import as a new instance -----------------------------------
        // Channel capacity >= workshop item count so `import::run` never
        // blocks on a full queue (nothing drains `_rx` in this test).
        let (tx, _rx) = tokio::sync::mpsc::channel(8);
        let new_id = import::run(&tx, &pack_path.to_string_lossy(), "Roundtrip Target")
            .await
            .expect("import");
        assert_ne!(new_id, inst.id, "import must create a new instance");

        let new_inst = disk::read(&new_id).expect("read imported");
        assert_eq!(new_inst.name, "Roundtrip Target");
        // Export projected `41.78.16` → manifest string; import parsed it
        // back to a structured Stable build (locked decision §9.1).
        assert_eq!(
            new_inst.game_version,
            instance::GameVersion {
                branch: instance::Branch::Stable,
                build: Some("41.78.16".into()),
            }
        );
        // Identity passed through the manifest losslessly.
        assert_eq!(new_inst.author.as_deref(), Some("knoxkit"));
        assert_eq!(new_inst.pack_version.as_deref(), Some("1.0.0"));
        assert!(new_inst.pack_id.is_some(), "pack_id round-trips");
        assert_eq!(
            new_inst.source.as_ref().map(|s| s.kind.as_str()),
            Some("knoxpack")
        );

        // --- the override file was copied -------------------------------
        let copied = std::path::Path::new(&new_inst.path)
            .join("overrides")
            .join("jvm-args.txt");
        assert!(copied.exists(), "jvm-args.txt override should be copied");
        let copied_body = std::fs::read_to_string(&copied).expect("read override");
        assert_eq!(copied_body, "-Xmx6g\n-Dzomboid=1");

        // --- the icon round-trips byte-for-byte -------------------------
        assert_eq!(
            new_inst.icon_path.as_deref(),
            Some("icon.png"),
            "imported instance should carry the restored icon path"
        );
        let imported_icon = std::path::Path::new(&new_inst.path).join("icon.png");
        assert!(imported_icon.is_file(), "icon.png should exist on import");
        assert_eq!(
            std::fs::read(&imported_icon).expect("read imported icon"),
            icon_bytes,
            "icon bytes must survive export → import unchanged"
        );
        // And it is present in the exported archive at the root.
        {
            let f = std::fs::File::open(&pack_path).expect("open pack icon");
            let mut a = zip::ZipArchive::new(f).expect("zip icon");
            let mut e = a.by_name("icon.png").expect("archive has icon.png");
            let mut b = Vec::new();
            e.read_to_end(&mut b).expect("read archive icon");
            assert_eq!(b, icon_bytes, "archive icon matches source bytes");
        }

        // --- manifest roundtrips (re-read after import) -----------------
        let reread_manifest = {
            let f = std::fs::File::open(&pack_path).expect("open pack 2");
            let mut a = zip::ZipArchive::new(f).expect("zip 2");
            let mut e = a.by_name("knoxpack.json").expect("knoxpack.json 2");
            let mut b = Vec::new();
            e.read_to_end(&mut b).expect("read manifest 2");
            manifest::parse(&b).expect("parse 2")
        };
        // Full structural equality (Manifest derives PartialEq).
        assert_eq!(reread_manifest, exported_manifest);
        assert_eq!(reread_manifest.workshop_items.len(), 2);
        assert_eq!(reread_manifest.workshop_items[0].workshop_id, 2392709985);
        manifest::validate(&reread_manifest).expect("exported manifest is valid");

        unsafe {
            std::env::remove_var(paths::DATA_DIR_ENV);
        }
        drop(tmp);
    }
}
