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
            game_version: "41.78.16".into(),
            jvm_args: vec!["-Xmx6g".into(), "-Dzomboid=1".into()],
        })
        .expect("create source");

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
        assert_eq!(new_inst.game_version, "41.78.16");

        // --- the override file was copied -------------------------------
        let copied = std::path::Path::new(&new_inst.path)
            .join("overrides")
            .join("jvm-args.txt");
        assert!(copied.exists(), "jvm-args.txt override should be copied");
        let copied_body = std::fs::read_to_string(&copied).expect("read override");
        assert_eq!(copied_body, "-Xmx6g\n-Dzomboid=1");

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
