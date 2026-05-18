//! First-run onboarding service: PZ + SteamCMD detection / install and the
//! derived setup status.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `setup::status`, `setup::detect_game_path`,
//! `setup::set_game_path`, `setup::detect_steamcmd`,
//! `setup::install_steamcmd`.
//!
//! Settings persistence is replicated here (same on-disk shape as
//! `commands::settings`) rather than depending on `commands/` — services
//! never import commands. It is the documented ~5-line read/merge/write.

pub mod detect;
pub mod steamcmd;

use crate::domain::settings::Settings;
use crate::domain::setup::Status;
use crate::error::Result;
use crate::paths;

/// Read `settings.json`, or [`Settings::default`] if absent.
fn read_settings() -> Result<Settings> {
    let file = paths::settings_file()?;
    if !file.exists() {
        return Ok(Settings::default());
    }
    let bytes = std::fs::read(&file)?;
    Ok(serde_json::from_slice(&bytes)?)
}

/// Atomically persist `settings` (temp + rename, mirrors
/// `commands::settings::update`).
fn write_settings(settings: &Settings) -> Result<()> {
    let file = paths::settings_file()?;
    paths::ensure_parent(&file)?;
    let tmp = file.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(settings)?)?;
    std::fs::rename(&tmp, &file)?;
    Ok(())
}

/// Current onboarding status derived from the persisted settings.
pub fn status() -> Result<Status> {
    let s = read_settings()?;
    Ok(Status::from_paths(s.game_path, s.steamcmd_path))
}

/// Auto-detect the Project Zomboid install directory (Steam scan). Returns
/// `None` if PZ is not found; does not persist anything.
pub fn detect_game_path() -> Option<String> {
    detect::game_path().map(|p| p.to_string_lossy().into_owned())
}

/// Validate that `path` exists as a directory and persist it as
/// `settings.game_path`. Returns the updated status.
pub fn set_game_path(path: &str) -> Result<Status> {
    let dir = std::path::Path::new(path);
    if !dir.is_dir() {
        return Err(crate::Error::NotFound(format!(
            "game path is not an existing directory: {path}"
        )));
    }
    let mut s = read_settings()?;
    s.game_path = Some(path.to_string());
    write_settings(&s)?;
    Ok(Status::from_paths(s.game_path, s.steamcmd_path))
}

/// Resolve an already-available steamcmd (settings → in-app dir → repo-local).
/// Returns `None` if none is installed.
pub fn detect_steamcmd() -> Result<Option<String>> {
    let s = read_settings()?;
    Ok(steamcmd::detect(s.steamcmd_path.as_deref()).map(|p| p.to_string_lossy().into_owned()))
}

/// Install SteamCMD in-app (download + extract + bootstrap) and persist its
/// resolved exe path into `settings.steamcmd_path`. If a steamcmd is already
/// available it is reused (no re-download). Returns the exe path.
pub fn install_steamcmd() -> Result<String> {
    let mut s = read_settings()?;
    let exe = match steamcmd::detect(s.steamcmd_path.as_deref()) {
        Some(p) => p,
        None => steamcmd::install()?,
    };
    let exe_str = exe.to_string_lossy().into_owned();
    s.steamcmd_path = Some(exe_str.clone());
    write_settings(&s)?;
    // TODO(review): the steamcmd worker still resolves its exe from
    // KNOXKIT_STEAMCMD / "steamcmd" (see services/steamcmd/worker.rs and
    // lib.rs setup); wiring it to read settings.steamcmd_path at job time is
    // out of scope for onboarding — we only persist the setting here.
    Ok(exe_str)
}

/// Reset all persisted settings to [`Settings::default`] — clears the
/// configured Project Zomboid and SteamCMD paths so the first-run onboarding
/// gate triggers again. Returns the (now fresh) status.
pub fn reset() -> Result<Status> {
    let s = Settings::default();
    write_settings(&s)?;
    Ok(Status::from_paths(s.game_path, s.steamcmd_path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    /// Acquire the env lock + point KNOXKIT_DATA_DIR at a fresh temp dir.
    /// Returns the guard + tempdir (kept alive by the caller).
    fn isolated() -> (std::sync::MutexGuard<'static, ()>, tempfile::TempDir) {
        let guard = paths::TEST_ENV_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        // SAFETY: TEST_ENV_LOCK serializes env-var mutating tests.
        unsafe {
            std::env::set_var(paths::DATA_DIR_ENV, tmp.path());
        }
        (guard, tmp)
    }

    fn clear_env() {
        // SAFETY: still under TEST_ENV_LOCK in the calling test.
        unsafe {
            std::env::remove_var(paths::DATA_DIR_ENV);
        }
    }

    #[test]
    fn status_needs_onboarding_on_fresh_install() {
        let (_g, _tmp) = isolated();
        let st = status().expect("status");
        assert!(st.needs_onboarding);
        assert_eq!(st.game_path, None);
        clear_env();
    }

    #[test]
    fn set_game_path_rejects_nonexistent_dir() {
        let (_g, _tmp) = isolated();
        let err = set_game_path("Z:\\definitely\\not\\here").expect_err("should reject");
        assert!(matches!(err, crate::Error::NotFound(_)));
        clear_env();
    }

    #[test]
    fn set_game_path_persists_and_updates_status() {
        let (_g, tmp) = isolated();
        let game = tmp.path().join("PZ");
        std::fs::create_dir_all(&game).expect("mkdir game");

        let st = set_game_path(&game.to_string_lossy()).expect("set");
        assert_eq!(st.game_path.as_deref(), Some(&*game.to_string_lossy()));
        // steamcmd still unset → still onboarding.
        assert!(st.needs_onboarding);

        // Persisted: a fresh status read sees it.
        let reread = status().expect("status");
        assert_eq!(reread.game_path, st.game_path);
        clear_env();
    }

    #[test]
    fn reset_clears_paths_and_re_triggers_onboarding() {
        let (_g, tmp) = isolated();
        let game = tmp.path().join("PZ");
        std::fs::create_dir_all(&game).expect("mkdir");
        set_game_path(&game.to_string_lossy()).expect("set game");
        let mut s = read_settings().expect("read");
        s.steamcmd_path = Some("C:\\sc\\steamcmd.exe".into());
        write_settings(&s).expect("write");
        assert!(!status().expect("status").needs_onboarding);

        let st = reset().expect("reset");
        assert!(st.needs_onboarding);
        assert_eq!(st.game_path, None);
        let reread = status().expect("status");
        assert!(reread.needs_onboarding);
        assert_eq!(reread.steamcmd_path, None);
        clear_env();
    }

    #[test]
    fn status_complete_when_both_paths_set() {
        let (_g, tmp) = isolated();
        let game = tmp.path().join("PZ");
        std::fs::create_dir_all(&game).expect("mkdir");
        set_game_path(&game.to_string_lossy()).expect("set game");

        // Hand-write a steamcmd path into settings (install() would hit the
        // network; here we only assert the status derivation).
        let mut s = read_settings().expect("read");
        s.steamcmd_path = Some("C:\\sc\\steamcmd.exe".into());
        write_settings(&s).expect("write");

        let st = status().expect("status");
        assert!(!st.needs_onboarding);
        clear_env();
    }
}
