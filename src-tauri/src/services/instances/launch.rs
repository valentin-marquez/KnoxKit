//! Best-effort Project Zomboid launch for one instance.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `launch::run`.
//!
//! Isolation is load-bearing: every launch passes `-cachedir=<instance.path>`
//! so PZ writes saves / options / mods under the instance folder and never
//! collides with any other instance (disk is the only source of truth — see
//! docs/architecture.md). Per-instance heap is pinned via a generated
//! `-pzexeconfig` JSON (docs/instance-redesign.md §4, locked decision §9.2):
//! `ProjectZomboid64.exe` reads JVM args from that file, so we never touch the
//! command line's brittle `--` JVM/game-arg contract and never mutate the
//! global `ProjectZomboid64.json`. The child is spawned **detached**
//! (`.spawn()`, no `.wait()`) so the launcher returns immediately.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::domain::instance::Instance;
use crate::domain::settings::Settings;
use crate::error::{Error, Result};
use crate::paths;
use crate::services::instances::{disk, pz, pzexe};
use crate::services::system;

/// Canonical Project Zomboid 64-bit launcher executable name (Windows).
const PZ_EXE: &str = "ProjectZomboid64.exe";

/// Launch the instance identified by `id`.
///
/// Reads the instance and global settings from disk, resolves the game
/// executable, resolves + clamps the per-instance heap, generates the
/// instance's `-pzexeconfig` JSON, then spawns Project Zomboid **detached**
/// with `-cachedir=<instance.path>` so all PZ user data stays inside this
/// instance's folder. Returns as soon as the child is spawned.
pub fn run(id: &str) -> Result<()> {
    let inst: Instance = disk::read(id)?;
    let settings = read_settings()?;

    let exe = resolve_exe(settings.game_path.as_deref())?;

    // Resolve + hard-clamp the heap, generate the per-instance pzexe config.
    let total_mb = system::total_ram_mb().unwrap_or(0);
    let heap_mb = resolve_heap_mb(&inst, &settings, total_mb);
    let inst_dir = Path::new(&inst.path);
    let game_dir = exe.parent().unwrap_or_else(|| Path::new("."));
    let pzexe_path = pzexe::write_for_instance(game_dir, inst_dir, id, heap_mb)?;

    let args = build_args(&pzexe_path, inst_dir);

    // Make the enabled mods discoverable + active inside the instance's
    // `-cachedir`: rebuild `<inst>/mods/` junctions and regenerate
    // `<inst>/Server/servertest.ini` from `mods.json`. Best-effort: a failure
    // to read mods or sync the layout must not block launching the (still
    // fully isolated) game — per-mod problems are logged inside the sync.
    match disk::read_mods(id) {
        Ok(coll) => {
            if let Err(e) = pz::sync_instance_mods(inst_dir, &coll) {
                tracing::warn!("mod sync failed for instance {id}, launching without mods: {e}");
            }
        }
        Err(e) => tracing::warn!("could not read mods.json for instance {id}: {e}"),
    }

    Command::new(&exe).args(&args).spawn()?;

    // Stamp last_played after a successful spawn. A failure here is non-fatal:
    // the game is already running; only the timestamp/index lags.
    if let Err(e) = disk::touch_last_played(id) {
        tracing::warn!("failed to update last_played for instance {id}: {e}");
    }
    Ok(())
}

/// Read global settings from `paths::settings_file()`.
///
/// Returns [`Settings::default`] when the file is absent (a fresh install has
/// no `settings.json`); any present-but-unreadable file surfaces as an error.
fn read_settings() -> Result<Settings> {
    let file = paths::settings_file()?;
    if !file.exists() {
        return Ok(Settings::default());
    }
    let bytes = std::fs::read(&file)?;
    let settings: Settings = serde_json::from_slice(&bytes)?;
    Ok(settings)
}

/// Resolve the Project Zomboid executable from the configured `game_path`.
///
/// - `None` → [`Error::NotFound`] (the user has not configured the game path).
/// - a path ending in `.exe` → used as-is.
/// - any other (directory) path → joined with [`PZ_EXE`].
///
/// The resolved path must exist on disk, otherwise [`Error::NotFound`].
fn resolve_exe(game_path: Option<&str>) -> Result<PathBuf> {
    let raw = game_path
        .ok_or_else(|| Error::NotFound("game_path not configured; set it in Settings".into()))?;

    let candidate = Path::new(raw);
    let exe = if candidate
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
    {
        candidate.to_path_buf()
    } else {
        candidate.join(PZ_EXE)
    };

    if !exe.exists() {
        return Err(Error::NotFound(format!(
            "Project Zomboid executable not found at {}; check the game path in Settings",
            exe.display()
        )));
    }
    Ok(exe)
}

/// Resolve the heap (MB) to pin for this launch, then hard-clamp it.
///
/// Precedence (docs/instance-redesign.md §4): the structured per-instance
/// `max_ram_mb` wins; else the `-Xmx` parsed out of the global
/// `settings.default_jvm_args` (back-compat for users who set heap there);
/// else the policy default for this machine. The chosen value is then run
/// through [`system::clamp_heap_mb`] so it can never starve PZ's off-heap
/// allocations regardless of where it came from. `total_mb == 0` means the
/// machine total is unknown — the clamp degrades to "trust the request".
fn resolve_heap_mb(inst: &Instance, settings: &Settings, total_mb: u64) -> u32 {
    let requested = inst
        .max_ram_mb
        .or_else(|| parse_xmx_mb(&settings.default_jvm_args))
        .unwrap_or_else(|| system::recommended_default_mb(total_mb));

    if total_mb == 0 {
        requested
    } else {
        system::clamp_heap_mb(requested, total_mb)
    }
}

/// Parse the first `-Xmx` value out of free-form JVM args, in MB.
///
/// Accepts `-Xmx<n>[k|m|g]` (case-insensitive suffix, JVM-style). A bare
/// number is treated as bytes (JVM default) and floored to MB. Returns `None`
/// when there is no `-Xmx` or it does not parse — the caller then falls back
/// to the machine default. Pure, zero-IO.
fn parse_xmx_mb(jvm_args: &[String]) -> Option<u32> {
    for a in jvm_args {
        let a = a.trim();
        let Some(rest) = a.strip_prefix("-Xmx").or_else(|| a.strip_prefix("-XMX")) else {
            continue;
        };
        let rest = rest.trim();
        if rest.is_empty() {
            continue;
        }
        let (num, mult): (&str, u64) = match rest.chars().last().map(|c| c.to_ascii_lowercase()) {
            Some('k') => (&rest[..rest.len() - 1], 1),
            Some('m') => (&rest[..rest.len() - 1], 1024),
            Some('g') => (&rest[..rest.len() - 1], 1024 * 1024),
            Some(c) if c.is_ascii_digit() => (rest, 0),
            _ => continue,
        };
        let Ok(value) = num.trim().parse::<u64>() else {
            continue;
        };
        let mb = if mult == 0 {
            value / (1024 * 1024) // bare number = bytes
        } else {
            (value * mult) / 1024
        };
        if mb == 0 {
            continue;
        }
        return Some(u32::try_from(mb).unwrap_or(u32::MAX));
    }
    None
}

/// Build the launch argument vector.
///
/// The per-instance `-pzexeconfig` pins JVM args (heap), `-pzexelog` captures
/// the launcher's own log inside the instance, and the load-bearing
/// `-cachedir=<instance>` isolates all PZ user data; `-modfolders mods` makes
/// PZ enumerate the `<cachedir>/mods` set this launch rebuilt from
/// `mods.json`. No free-form JVM args / `--` separator: the old command-line
/// path was broken (docs/instance-redesign.md §4) and is fully replaced.
fn build_args(pzexe_config: &Path, instance_dir: &Path) -> Vec<String> {
    let launcher_log = instance_dir.join("launcher.log");
    vec![
        "-pzexeconfig".to_string(),
        pzexe_config.to_string_lossy().into_owned(),
        "-pzexelog".to_string(),
        launcher_log.to_string_lossy().into_owned(),
        format!("-cachedir={}", instance_dir.display()),
        "-modfolders".to_string(),
        "mods".to_string(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::instance::{Branch, GameVersion};
    use pretty_assertions::assert_eq;

    fn instance_with(max_ram_mb: Option<u32>) -> Instance {
        Instance {
            schema_version: 2,
            id: "i".into(),
            name: "n".into(),
            game_version: GameVersion {
                branch: Branch::Stable,
                build: None,
            },
            jvm_args: Vec::new(),
            created_at: "2026-01-01T00:00:00Z".into(),
            last_played: None,
            path: "C:/data/instances/i".into(),
            max_ram_mb,
            icon_path: None,
            description: None,
            author: None,
            pack_version: None,
            pack_id: None,
            source: None,
        }
    }

    #[test]
    fn resolve_exe_none_is_not_found() {
        let err = resolve_exe(None).expect_err("None must be NotFound");
        assert!(matches!(err, Error::NotFound(_)));
    }

    #[test]
    fn resolve_exe_missing_is_not_found() {
        let err = resolve_exe(Some("Z:/definitely/missing/pz"))
            .expect_err("missing dir must be NotFound");
        assert!(matches!(err, Error::NotFound(_)));
    }

    #[test]
    fn resolve_exe_direct_exe_path_is_used_as_is() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let exe = tmp.path().join("ProjectZomboid64.exe");
        std::fs::write(&exe, b"fake").expect("write fake exe");

        let resolved =
            resolve_exe(Some(exe.to_str().expect("utf8 path"))).expect("existing exe resolves");
        assert_eq!(resolved, exe);
    }

    #[test]
    fn resolve_exe_directory_joins_pz_exe_name() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let exe = tmp.path().join(PZ_EXE);
        std::fs::write(&exe, b"fake").expect("write fake exe");

        let resolved = resolve_exe(Some(tmp.path().to_str().expect("utf8 path")))
            .expect("dir with PZ exe resolves");
        assert_eq!(resolved, exe);
    }

    #[test]
    fn resolve_exe_extension_match_is_case_insensitive() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let exe = tmp.path().join("Custom.EXE");
        std::fs::write(&exe, b"fake").expect("write fake exe");

        let resolved = resolve_exe(Some(exe.to_str().expect("utf8 path")))
            .expect(".EXE is treated as a direct exe path");
        assert_eq!(resolved, exe);
    }

    #[test]
    fn build_args_emits_pzexeconfig_shape_not_legacy_jvm() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let cfg = tmp.path().join("i.pzexe.json");
        let inst = Path::new("C:/data/instances/abc");
        let args = build_args(&cfg, inst);

        // New shape: pzexeconfig + pzexelog + cachedir + modfolders mods.
        assert_eq!(args[0], "-pzexeconfig");
        assert_eq!(args[1], cfg.to_string_lossy());
        assert_eq!(args[2], "-pzexelog");
        assert_eq!(args[3], inst.join("launcher.log").to_string_lossy());
        assert_eq!(args[4], "-cachedir=C:/data/instances/abc");
        assert_eq!(args[5], "-modfolders");
        assert_eq!(args[6], "mods");

        // The broken legacy contract is gone: no bare `--`, no free `-Xmx`
        // on the command line (heap is pinned via the pzexe JSON instead).
        assert!(!args.iter().any(|a| a == "--"), "no bare -- separator");
        assert!(
            !args.iter().any(|a| a.starts_with("-Xmx")),
            "heap must not be a command-line arg anymore: {args:?}"
        );
    }

    #[test]
    fn generated_pzexe_json_carries_the_resolved_xmx() {
        // End-to-end of the heap path WITHOUT spawning PZ: resolve → render.
        let tmp = tempfile::tempdir().expect("tempdir");
        let game = tmp.path().join("game");
        let inst_dir = tmp.path().join("inst");
        std::fs::create_dir_all(&game).expect("mkdir game");
        std::fs::create_dir_all(&inst_dir).expect("mkdir inst");
        std::fs::write(
            game.join("ProjectZomboid64.json"),
            r#"{ "vmArgs": ["-XX:+UseZGC", "-Xmx3072m"] }"#,
        )
        .expect("write install json");

        let inst = instance_with(Some(5120));
        let settings = Settings::default();
        // 16 GB machine: clamp leaves 5120 untouched (well under bounds).
        let heap = resolve_heap_mb(&inst, &settings, 16384);
        assert_eq!(heap, 5120);

        let path =
            pzexe::write_for_instance(&game, &inst_dir, "abc", heap).expect("write pzexe json");
        let body = std::fs::read_to_string(&path).expect("read pzexe json");
        let v: serde_json::Value = serde_json::from_str(&body).expect("parse");
        let args: Vec<String> = v["vmArgs"]
            .as_array()
            .expect("vmArgs")
            .iter()
            .map(|x| x.as_str().expect("str").to_string())
            .collect();
        assert!(
            args.contains(&"-Xmx5120m".to_string()),
            "resolved heap: {args:?}"
        );
        assert!(args.contains(&"-XX:+UseZGC".to_string()), "GC preserved");
        assert!(
            !args.contains(&"-Xmx3072m".to_string()),
            "install heap replaced"
        );
    }

    #[test]
    fn resolve_heap_prefers_instance_then_settings_then_default() {
        // 1. Instance override wins outright.
        let inst = instance_with(Some(6144));
        assert_eq!(resolve_heap_mb(&inst, &Settings::default(), 32768), 6144);

        // 2. No instance cap → parse -Xmx from settings.default_jvm_args.
        let inst = instance_with(None);
        let settings = Settings {
            default_jvm_args: vec!["-Xmx4g".into(), "-XX:+UseG1GC".into()],
            ..Settings::default()
        };
        assert_eq!(resolve_heap_mb(&inst, &settings, 32768), 4096);

        // 3. Neither → machine policy default (32 GB → ceiling 8192).
        let inst = instance_with(None);
        assert_eq!(resolve_heap_mb(&inst, &Settings::default(), 32768), 8192);
    }

    #[test]
    fn resolve_heap_is_hard_clamped() {
        // Instance asks for 32 GB on a 4 GB machine → clamped down.
        let inst = instance_with(Some(32768));
        let clamped = resolve_heap_mb(&inst, &Settings::default(), 4096);
        assert!(clamped <= 4096, "must be clamped: {clamped}");
        assert_eq!(clamped, system::clamp_heap_mb(32768, 4096));
    }

    #[test]
    fn resolve_heap_unknown_total_trusts_request() {
        let inst = instance_with(Some(12288));
        assert_eq!(resolve_heap_mb(&inst, &Settings::default(), 0), 12288);
    }

    #[test]
    fn parse_xmx_handles_suffixes_and_bytes() {
        assert_eq!(parse_xmx_mb(&["-Xmx4g".into()]), Some(4096));
        assert_eq!(parse_xmx_mb(&["-Xmx2048m".into()]), Some(2048));
        assert_eq!(parse_xmx_mb(&["-Xmx1048576k".into()]), Some(1024));
        // bare number = bytes (3 GiB).
        assert_eq!(parse_xmx_mb(&["-Xmx3221225472".into()]), Some(3072));
        // unrelated args / no -Xmx.
        assert_eq!(parse_xmx_mb(&["-XX:+UseZGC".into()]), None);
        assert_eq!(parse_xmx_mb(&[]), None);
        // garbage value → None (fall through to default).
        assert_eq!(parse_xmx_mb(&["-Xmxbogus".into()]), None);
    }
}
