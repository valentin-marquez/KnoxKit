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
/// `needs_onboarding` is `true` while the Project Zomboid game path, the
/// SteamCMD executable path, or a non-empty profile username is unset; the
/// hard gate redirects to `/onboarding` until it flips to `false`. The
/// profile username is a required onboarding step (it is the authoritative
/// source for every instance's `author`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Status {
    /// `true` until `game_path`, `steamcmd_path`, and a non-empty
    /// `profile_username` are all configured.
    pub needs_onboarding: bool,
    /// Configured Project Zomboid install path, if any.
    pub game_path: Option<String>,
    /// Configured SteamCMD executable path, if any.
    pub steamcmd_path: Option<String>,
    /// Configured Project Zomboid multiplayer username, if any. Trimmed-empty
    /// is normalized to `None` (a blank name does not satisfy the gate).
    pub profile_username: Option<String>,
}

impl Status {
    /// Derive a [`Status`] from the persisted paths and profile username.
    /// Onboarding is needed while any of the three is absent (a trimmed-empty
    /// username counts as absent).
    pub fn from_paths(
        game_path: Option<String>,
        steamcmd_path: Option<String>,
        profile_username: Option<String>,
    ) -> Self {
        let profile_username = profile_username.filter(|u| !u.trim().is_empty());
        let needs_onboarding =
            game_path.is_none() || steamcmd_path.is_none() || profile_username.is_none();
        Self {
            needs_onboarding,
            game_path,
            steamcmd_path,
            profile_username,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn needs_onboarding_until_all_three_present() {
        assert!(Status::from_paths(None, None, None).needs_onboarding);
        assert!(Status::from_paths(Some("g".into()), None, None).needs_onboarding);
        assert!(Status::from_paths(None, Some("s".into()), None).needs_onboarding);
        // Game + steamcmd but no username still needs onboarding.
        assert!(Status::from_paths(Some("g".into()), Some("s".into()), None).needs_onboarding);
        // A blank/whitespace username does not satisfy the gate.
        assert!(
            Status::from_paths(Some("g".into()), Some("s".into()), Some("  ".into()))
                .needs_onboarding
        );
        let done = Status::from_paths(Some("g".into()), Some("s".into()), Some("nick".into()));
        assert!(!done.needs_onboarding);
        assert_eq!(done.game_path.as_deref(), Some("g"));
        assert_eq!(done.profile_username.as_deref(), Some("nick"));
    }

    #[test]
    fn serializes_snake_case() {
        let json = serde_json::to_string(&Status::from_paths(None, None, None)).expect("serialize");
        assert!(json.contains("\"needs_onboarding\""));
        assert!(json.contains("\"game_path\""));
        assert!(json.contains("\"steamcmd_path\""));
        assert!(json.contains("\"profile_username\""));
    }
}
