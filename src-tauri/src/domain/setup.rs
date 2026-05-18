//! First-run onboarding status domain type.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `setup::Status`.
//!
//! Pure: zero IO, zero async, zero `tauri`. Mirrored on the frontend by
//! `src/types/setup.ts` (snake_case wire fields, serde defaults).

use serde::{Deserialize, Serialize};

/// Snapshot of whether first-run onboarding is still required.
///
/// `needs_onboarding` is `true` while either the Project Zomboid game path or
/// the SteamCMD executable path is unset; the hard gate redirects to
/// `/onboarding` until it flips to `false`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Status {
    /// `true` until both `game_path` and `steamcmd_path` are configured.
    pub needs_onboarding: bool,
    /// Configured Project Zomboid install path, if any.
    pub game_path: Option<String>,
    /// Configured SteamCMD executable path, if any.
    pub steamcmd_path: Option<String>,
}

impl Status {
    /// Derive a [`Status`] from the two persisted paths. Onboarding is needed
    /// while either is absent.
    pub fn from_paths(game_path: Option<String>, steamcmd_path: Option<String>) -> Self {
        let needs_onboarding = game_path.is_none() || steamcmd_path.is_none();
        Self {
            needs_onboarding,
            game_path,
            steamcmd_path,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn needs_onboarding_until_both_paths_present() {
        assert!(Status::from_paths(None, None).needs_onboarding);
        assert!(Status::from_paths(Some("g".into()), None).needs_onboarding);
        assert!(Status::from_paths(None, Some("s".into())).needs_onboarding);
        let done = Status::from_paths(Some("g".into()), Some("s".into()));
        assert!(!done.needs_onboarding);
        assert_eq!(done.game_path.as_deref(), Some("g"));
    }

    #[test]
    fn serializes_snake_case() {
        let json = serde_json::to_string(&Status::from_paths(None, None)).expect("serialize");
        assert!(json.contains("\"needs_onboarding\""));
        assert!(json.contains("\"game_path\""));
        assert!(json.contains("\"steamcmd_path\""));
    }
}
