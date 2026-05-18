//! Per-instance `-pzexeconfig` JSON generation (the §4 RAM mechanism).
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `pzexe::render_pzexe`, `pzexe::write_for_instance`.
//!
//! `ProjectZomboid64.exe` is a thin launcher that reads
//! `<gameDir>/ProjectZomboid64.json` (`vmArgs`) and spawns the bundled JRE.
//! Editing that file would mutate a **global** install shared by every
//! instance, so instead we generate a per-instance copy with only the heap
//! flags rewritten and pass it via `-pzexeconfig` (docs/instance-redesign.md
//! §4, locked decision §9.2). Every other vmArg — crucially the install's GC
//! flags, which differ B41↔B42 and are **(uncertain)** — is preserved verbatim
//! (docs §4: "Preserve the install's existing GC flags rather than
//! hardcoding").
//!
//! [`render_pzexe`] is **pure** (no IO, no async) and is hard unit-tested.
//! [`write_for_instance`] is the thin IO wrapper (read install JSON or the
//! frozen fallback template → render → atomic write).

use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::error::Result;

/// Heap floor applied to `-Xms` (initial heap), in MB. Mirrors the slider
/// floor in `services::system`; kept local so this pure module does not reach
/// into another service for a constant.
const XMS_MB: u32 = 2048;

/// Frozen fallback `ProjectZomboid64.json` body, used when the install's file
/// is absent or unparseable.
///
/// Deliberately minimal and conservative: it carries **no GC flag** (we must
/// not guess B41 vs B42 GC — docs §5 flags this as uncertain) and only the
/// structural args PZ's launcher needs plus a placeholder heap that
/// [`render_pzexe`] overwrites. `mainClass`/`classpath`/`vmArgs` keys match
/// the real launcher schema so a real `ProjectZomboid64.exe` accepts it.
const FALLBACK_PZEXE_JSON: &str = r#"{
  "mainClass": "zombie/gameStates/MainScreenState",
  "classpath": [
    "."
  ],
  "vmArgs": [
    "-Djava.awt.headless=true",
    "-Xmx3072m",
    "-Xms2048m"
  ]
}"#;

/// Render a per-instance `-pzexeconfig` JSON body from the install's
/// `ProjectZomboid64.json` text, rewriting only the heap.
///
/// **Pure**: no IO, no async. Behaviour:
/// - parses `install_json`; if that fails the frozen [`FALLBACK_PZEXE_JSON`]
///   is parsed instead (so a corrupt install file never blocks launching);
/// - in the top-level `vmArgs` array **and** in every `windows.<ver>.vmArgs`
///   array, drops any existing `-Xmx…` / `-Xms…` entry and appends
///   `-Xmx{heap_mb}m` + `-Xms{min}m` (min = `min(XMS_MB, heap_mb)` so a
///   sub-2 GB cap never produces `-Xms > -Xmx`);
/// - **every other vmArg is preserved verbatim and in order** (GC flags,
///   `-D…` system props, headless, etc.);
/// - returns pretty-printed JSON (stable 2-space indent via `serde_json`).
///
/// `heap_mb` is assumed already policy-clamped by the caller
/// (`services::system::clamp_heap_mb`).
pub fn render_pzexe(install_json: &str, heap_mb: u32) -> Result<String> {
    let mut root: Value = match serde_json::from_str(install_json) {
        Ok(v) => v,
        Err(_) => serde_json::from_str(FALLBACK_PZEXE_JSON)?,
    };
    if !root.is_object() {
        root = serde_json::from_str(FALLBACK_PZEXE_JSON)?;
    }

    let xms_mb = XMS_MB.min(heap_mb);

    // Top-level vmArgs.
    if let Some(arr) = root.get_mut("vmArgs").and_then(Value::as_array_mut) {
        rewrite_heap(arr, heap_mb, xms_mb);
    } else if let Some(obj) = root.as_object_mut() {
        // No vmArgs at all → introduce one carrying just the heap so the
        // generated config still pins memory.
        obj.insert(
            "vmArgs".to_string(),
            Value::Array(heap_args(heap_mb, xms_mb)),
        );
    }

    // Every windows.<ver>.vmArgs block (the launcher also reads these).
    if let Some(win) = root.get_mut("windows").and_then(Value::as_object_mut) {
        for ver in win.values_mut() {
            if let Some(arr) = ver.get_mut("vmArgs").and_then(Value::as_array_mut) {
                rewrite_heap(arr, heap_mb, xms_mb);
            }
        }
    }

    Ok(serde_json::to_string_pretty(&root)?)
}

/// Drop existing `-Xmx`/`-Xms` string entries from `arr`, then append the
/// fresh heap pair. Non-string entries and every non-heap arg are untouched
/// and keep their relative order.
fn rewrite_heap(arr: &mut Vec<Value>, heap_mb: u32, xms_mb: u32) {
    arr.retain(|v| match v.as_str() {
        Some(s) => !is_heap_flag(s),
        None => true,
    });
    arr.extend(heap_args(heap_mb, xms_mb));
}

/// The two heap args as JSON strings.
fn heap_args(heap_mb: u32, xms_mb: u32) -> Vec<Value> {
    vec![
        Value::String(format!("-Xmx{heap_mb}m")),
        Value::String(format!("-Xms{xms_mb}m")),
    ]
}

/// Whether `arg` is a heap-sizing flag we own (`-Xmx…` / `-Xms…`),
/// case-sensitive as the JVM is.
fn is_heap_flag(arg: &str) -> bool {
    let a = arg.trim();
    a.starts_with("-Xmx") || a.starts_with("-Xms")
}

/// Generate `<instance_dir>/<instance_id>.pzexe.json` for a launch.
///
/// IO wrapper around [`render_pzexe`]: reads `<game_dir>/ProjectZomboid64.json`
/// (falls back to the frozen template when it is missing/unreadable —
/// rendering itself also falls back on a parse error), renders with `heap_mb`,
/// then **atomically** writes the result (temp + rename, mirroring the rest of
/// the disk layer). Returns the absolute path written, ready to pass to
/// `ProjectZomboid64.exe -pzexeconfig <path>`.
pub fn write_for_instance(
    game_dir: &Path,
    instance_dir: &Path,
    instance_id: &str,
    heap_mb: u32,
) -> Result<PathBuf> {
    let install_json = std::fs::read_to_string(game_dir.join("ProjectZomboid64.json"))
        .unwrap_or_else(|_| FALLBACK_PZEXE_JSON.to_string());

    let rendered = render_pzexe(&install_json, heap_mb)?;

    let out = instance_dir.join(format!("{instance_id}.pzexe.json"));
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = out.with_extension("json.tmp");
    std::fs::write(&tmp, rendered.as_bytes())?;
    std::fs::rename(&tmp, &out)?;

    // Canonicalize so the path handed to the launcher is absolute regardless
    // of the caller's cwd; fall back to the joined path if the FS refuses.
    Ok(std::fs::canonicalize(&out).unwrap_or(out))
}

/// The frozen fallback template, exposed for callers/tests that need to assert
/// the no-install path uses it.
pub fn fallback_template() -> &'static str {
    FALLBACK_PZEXE_JSON
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn vm_args(json: &str) -> Vec<String> {
        let v: Value = serde_json::from_str(json).expect("parse rendered");
        v["vmArgs"]
            .as_array()
            .expect("vmArgs array")
            .iter()
            .map(|x| x.as_str().expect("string arg").to_string())
            .collect()
    }

    #[test]
    fn replaces_xmx_and_preserves_gc_and_props() {
        let install = r#"{
          "mainClass": "zombie/gameStates/MainScreenState",
          "vmArgs": [
            "-XX:+UseZGC",
            "-Xmx3072m",
            "-Xms2048m",
            "-Dfile.encoding=UTF-8"
          ]
        }"#;
        let out = render_pzexe(install, 6144).expect("render");
        let args = vm_args(&out);

        // GC + system prop preserved, in original relative order.
        assert!(args.contains(&"-XX:+UseZGC".to_string()));
        assert!(args.contains(&"-Dfile.encoding=UTF-8".to_string()));
        // Heap rewritten to the requested value.
        assert!(args.contains(&"-Xmx6144m".to_string()));
        assert!(args.contains(&"-Xms2048m".to_string()));
        // Old heap values are gone.
        assert!(!args.contains(&"-Xmx3072m".to_string()));
        // GC stays first (preserved order; heap appended at the end).
        assert_eq!(args.first().map(String::as_str), Some("-XX:+UseZGC"));
        assert_eq!(args[1], "-Dfile.encoding=UTF-8");
    }

    #[test]
    fn xms_never_exceeds_xmx_for_tiny_caps() {
        let install = r#"{ "vmArgs": ["-Xmx4096m", "-Xms2048m"] }"#;
        let out = render_pzexe(install, 1024).expect("render");
        let args = vm_args(&out);
        assert!(args.contains(&"-Xmx1024m".to_string()));
        // -Xms clamped down to the heap so the JVM does not reject it.
        assert!(args.contains(&"-Xms1024m".to_string()));
    }

    #[test]
    fn windows_version_blocks_are_rewritten_too() {
        let install = r#"{
          "vmArgs": ["-Xmx3072m", "-XX:+UseG1GC"],
          "windows": {
            "17": { "vmArgs": ["-Xmx3072m", "-Xss8m"] }
          }
        }"#;
        let out = render_pzexe(install, 5120).expect("render");
        let v: Value = serde_json::from_str(&out).expect("parse");

        let win_args: Vec<String> = v["windows"]["17"]["vmArgs"]
            .as_array()
            .expect("win vmArgs")
            .iter()
            .map(|x| x.as_str().expect("str").to_string())
            .collect();
        assert!(win_args.contains(&"-Xss8m".to_string()), "non-heap kept");
        assert!(
            win_args.contains(&"-Xmx5120m".to_string()),
            "heap rewritten"
        );
        assert!(!win_args.contains(&"-Xmx3072m".to_string()), "old gone");

        // Top-level GC flag still preserved alongside.
        assert!(vm_args(&out).contains(&"-XX:+UseG1GC".to_string()));
    }

    #[test]
    fn unparseable_install_uses_fallback_template() {
        let out = render_pzexe("}{ not json", 4096).expect("render falls back");
        let args = vm_args(&out);
        // Fallback's headless arg is present; heap is the requested value.
        assert!(args.contains(&"-Djava.awt.headless=true".to_string()));
        assert!(args.contains(&"-Xmx4096m".to_string()));
        assert!(args.contains(&"-Xms2048m".to_string()));
        // Fallback's placeholder heap was replaced, not duplicated.
        assert_eq!(
            args.iter().filter(|a| a.starts_with("-Xmx")).count(),
            1,
            "exactly one -Xmx: {args:?}"
        );
    }

    #[test]
    fn non_object_root_falls_back() {
        let out = render_pzexe("[1, 2, 3]", 3072).expect("render");
        let args = vm_args(&out);
        assert!(args.contains(&"-Xmx3072m".to_string()));
    }

    #[test]
    fn missing_vmargs_key_gets_one() {
        let out = render_pzexe(r#"{ "mainClass": "x" }"#, 4096).expect("render");
        let args = vm_args(&out);
        assert_eq!(args, vec!["-Xmx4096m", "-Xms2048m"]);
    }

    #[test]
    fn write_for_instance_uses_install_json_when_present() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let game = tmp.path().join("game");
        let inst = tmp.path().join("inst");
        std::fs::create_dir_all(&game).expect("mkdir game");
        std::fs::create_dir_all(&inst).expect("mkdir inst");
        std::fs::write(
            game.join("ProjectZomboid64.json"),
            r#"{ "vmArgs": ["-XX:+UseZGC", "-Xmx2048m"] }"#,
        )
        .expect("write install json");

        let path = write_for_instance(&game, &inst, "abc-123", 6144).expect("write");
        assert!(
            path.ends_with("abc-123.pzexe.json"),
            "named by id: {path:?}"
        );

        let body = std::fs::read_to_string(&path).expect("read back");
        let args = vm_args(&body);
        assert!(args.contains(&"-XX:+UseZGC".to_string()), "GC preserved");
        assert!(args.contains(&"-Xmx6144m".to_string()), "heap pinned");
    }

    #[test]
    fn write_for_instance_falls_back_when_install_json_absent() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let game = tmp.path().join("game-empty");
        let inst = tmp.path().join("inst");
        std::fs::create_dir_all(&game).expect("mkdir game");
        std::fs::create_dir_all(&inst).expect("mkdir inst");

        let path = write_for_instance(&game, &inst, "id", 4096).expect("write");
        let body = std::fs::read_to_string(&path).expect("read back");
        let args = vm_args(&body);
        assert!(args.contains(&"-Djava.awt.headless=true".to_string()));
        assert!(args.contains(&"-Xmx4096m".to_string()));
    }
}
