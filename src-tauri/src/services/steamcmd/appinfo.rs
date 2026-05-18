//! One-shot `app_info_print` reader: discover Project Zomboid Steam branches.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `appinfo::list_branches`.
//!
//! This is a **one-shot** SteamCMD invocation, deliberately NOT the
//! long-running worker actor (CLAUDE.md rule 4 is about Workshop downloads;
//! reading public app metadata is a single bounded command). Anonymous
//! SteamCMD can read app `108600`'s appinfo even though it cannot *download*
//! the game. Output is fed through the pure
//! [`super::appinfo_parser::parse_branches`]; this module only adds the
//! process spawn + timeout + the static-fallback policy.
//!
//! Hard rule: this NEVER errors out the UI. Any failure (no steamcmd,
//! spawn error, timeout, empty parse) returns the static
//! [`branch::fallback`] list so instance creation can never be blocked. The
//! test suite does not exercise this against a real process.

use std::time::Duration;

use tokio::process::Command;
use tokio::time::timeout;

use crate::domain::branch;
use crate::domain::settings::Settings;
use crate::paths;
use crate::services::setup::steamcmd as setup_steamcmd;

/// Project Zomboid Steam app id.
const APP_ID: &str = "108600";

/// Hard ceiling on the one-shot SteamCMD call. Anonymous appinfo is normally
/// a few seconds; on first run SteamCMD self-updates which can take longer,
/// so the budget is generous before falling back.
const TIMEOUT: Duration = Duration::from_secs(60);

/// Resolve PZ's Steam branches, always returning a non-empty list.
///
/// Resolves steamcmd via [`setup_steamcmd::detect`] (reading `settings.json`
/// the same way other services do — never importing `commands/`). With no
/// steamcmd, or on any spawn/timeout/empty-parse failure, the static
/// [`branch::fallback`] list is returned (a warning is logged). On success
/// every parsed `RawBranch` is mapped to a [`branch::Info`].
pub async fn list_branches() -> Vec<branch::Info> {
    match try_list_branches().await {
        Ok(list) if !list.is_empty() => list,
        Ok(_) => {
            tracing::warn!("app_info_print returned no branches; using static fallback");
            branch::fallback()
        }
        Err(reason) => {
            tracing::warn!("branch discovery failed ({reason}); using static fallback");
            branch::fallback()
        }
    }
}

/// Inner attempt. Returns `Err(reason)` for any failure the caller maps to the
/// static fallback; returns `Ok(parsed)` (possibly empty) on a clean run.
async fn try_list_branches() -> Result<Vec<branch::Info>, String> {
    let settings = read_settings();
    let Some(exe) = setup_steamcmd::detect(settings.steamcmd_path.as_deref()) else {
        return Err("steamcmd not installed".to_string());
    };

    // Anonymous one-shot: log in, refresh + print appinfo for PZ, quit.
    let mut cmd = Command::new(&exe);
    cmd.arg("+login")
        .arg("anonymous")
        .arg("+app_info_update")
        .arg("1")
        .arg("+app_info_print")
        .arg(APP_ID)
        .arg("+quit")
        .kill_on_drop(true)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());

    let output = match timeout(TIMEOUT, async { cmd.output().await }).await {
        Ok(Ok(out)) => out,
        Ok(Err(e)) => return Err(format!("spawn failed: {e}")),
        Err(_) => return Err(format!("timed out after {}s", TIMEOUT.as_secs())),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed = super::appinfo_parser::parse_branches(&stdout);
    Ok(parsed
        .into_iter()
        .map(|raw| branch::Info {
            branch: branch::map_branch(&raw.name),
            steam_name: raw.name,
            description: raw.description,
            build_id: raw.build_id,
        })
        .collect())
}

/// Read `settings.json` (or defaults) the same shape `services::setup` uses.
/// A read error degrades to defaults — branch discovery must never propagate.
fn read_settings() -> Settings {
    let Ok(file) = paths::settings_file() else {
        return Settings::default();
    };
    if !file.exists() {
        return Settings::default();
    }
    match std::fs::read(&file).map(|b| serde_json::from_slice::<Settings>(&b)) {
        Ok(Ok(s)) => s,
        _ => Settings::default(),
    }
}
