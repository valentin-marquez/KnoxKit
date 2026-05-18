//! Best-effort Project Zomboid launch for one instance.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `launch::run`.
//!
//! Isolation is load-bearing: every launch passes `-cachedir=<instance.path>`
//! so PZ writes saves / options / mods under the instance folder and never
//! collides with any other instance (disk is the only source of truth — see
//! docs/architecture.md). The child is spawned **detached** (`.spawn()`, no
//! `.wait()`) so the launcher returns immediately while the game runs.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::domain::instance::Instance;
use crate::domain::settings::Settings;
use crate::error::{Error, Result};
use crate::paths;
use crate::services::instances::{disk, pz};

/// Canonical Project Zomboid 64-bit launcher executable name (Windows).
const PZ_EXE: &str = "ProjectZomboid64.exe";

/// Launch the instance identified by `id`.
///
/// Reads the instance and global settings from disk, resolves the game
/// executable, then spawns Project Zomboid **detached** with the instance's
/// JVM args and `-cachedir=<instance.path>` so all PZ user data stays inside
/// this instance's folder. Returns as soon as the child is spawned.
pub fn run(id: &str) -> Result<()> {
    let inst: Instance = disk::read(id)?;
    let settings = read_settings()?;

    let exe = resolve_exe(settings.game_path.as_deref())?;
    let args = build_args(&inst.jvm_args, &inst.path);

    // Make the enabled mods discoverable + active inside the instance's
    // `-cachedir`: rebuild `<inst>/mods/` junctions and regenerate
    // `<inst>/Server/servertest.ini` from `mods.json`. Best-effort: a failure
    // to read mods or sync the layout must not block launching the (still
    // fully isolated) game — per-mod problems are logged inside the sync.
    match disk::read_mods(id) {
        Ok(coll) => {
            if let Err(e) = pz::sync_instance_mods(Path::new(&inst.path), &coll) {
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

/// Build the launch argument vector.
///
/// The instance's `jvm_args` come first, followed by the load-bearing
/// `-cachedir=<instance_path>` isolation argument (always present so PZ user
/// data never leaks between instances), then `-modfolders mods` so PZ
/// enumerates the `<cachedir>/mods` set this launch rebuilt from `mods.json`.
fn build_args(jvm_args: &[String], instance_path: &str) -> Vec<String> {
    let mut args: Vec<String> = jvm_args.to_vec();
    args.push(format!("-cachedir={instance_path}"));
    args.push("-modfolders".to_string());
    args.push("mods".to_string());
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

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
    fn build_args_always_includes_cachedir_and_modfolders() {
        let args = build_args(&[], "C:/data/instances/abc");
        assert_eq!(
            args,
            vec![
                "-cachedir=C:/data/instances/abc".to_string(),
                "-modfolders".to_string(),
                "mods".to_string(),
            ]
        );
    }

    #[test]
    fn build_args_preserves_jvm_args_before_cachedir_and_modfolders() {
        let jvm = vec!["-Xmx4g".to_string(), "-Dfoo=bar".to_string()];
        let args = build_args(&jvm, "/inst/path");
        assert_eq!(
            args,
            vec![
                "-Xmx4g".to_string(),
                "-Dfoo=bar".to_string(),
                "-cachedir=/inst/path".to_string(),
                "-modfolders".to_string(),
                "mods".to_string(),
            ]
        );
    }

    #[test]
    fn build_args_includes_modfolders_mods() {
        let args = build_args(&[], "/x");
        assert!(
            args.windows(2)
                .any(|w| w == ["-modfolders".to_string(), "mods".to_string()]),
            "args must contain `-modfolders mods`: {args:?}"
        );
    }
}
