//! Global application settings domain types.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `settings::Settings`, `settings::Patch`.

use serde::{Deserialize, Serialize};

/// Current persisted schema version for [`Settings`].
pub const SCHEMA_VERSION: u32 = 1;

/// Persisted global application settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Settings {
    /// Persisted schema version.
    pub schema_version: u32,
    /// Path to the `steamcmd` executable, if configured.
    pub steamcmd_path: Option<String>,
    /// Path to the Project Zomboid game install, if configured.
    pub game_path: Option<String>,
    /// Default JVM args applied to new instances.
    pub default_jvm_args: Vec<String>,
    /// UI locale, e.g. `"en"` or `"es-CL"`.
    pub locale: String,
    /// Project Zomboid multiplayer username (plaintext, not a secret).
    ///
    /// Optional; `None` until the user sets it. No password is ever stored.
    /// Additive/backward-compatible (`#[serde(default)]`) — older
    /// `settings.json` files lacking the key deserialize to `None` without a
    /// schema bump or migration.
    #[serde(default)]
    pub profile_username: Option<String>,
}

impl Default for Settings {
    /// Sensible defaults used when `settings.json` is absent.
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            steamcmd_path: None,
            game_path: None,
            default_jvm_args: Vec::new(),
            locale: "en".to_string(),
            profile_username: None,
        }
    }
}

/// Partial update for [`Settings`]. All fields optional; no `schema_version`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Patch {
    /// New steamcmd path (set to `Some` to change).
    #[serde(default)]
    pub steamcmd_path: Option<String>,
    /// New game path.
    #[serde(default)]
    pub game_path: Option<String>,
    /// Replacement default JVM args.
    #[serde(default)]
    pub default_jvm_args: Option<Vec<String>>,
    /// New locale.
    #[serde(default)]
    pub locale: Option<String>,
    /// New profile username.
    ///
    /// Double `Option`: outer `Some` means "this field is part of the patch",
    /// inner value is the new state (`Some(name)` to set, `None` to clear).
    /// Outer `None` (the serde default when the key is absent) leaves the
    /// stored username untouched.
    #[serde(default)]
    pub profile_username: Option<Option<String>>,
}

impl Settings {
    /// Apply `patch` in place. Only `Some` fields overwrite existing values.
    pub fn apply(&mut self, patch: Patch) {
        if patch.steamcmd_path.is_some() {
            self.steamcmd_path = patch.steamcmd_path;
        }
        if patch.game_path.is_some() {
            self.game_path = patch.game_path;
        }
        if let Some(args) = patch.default_jvm_args {
            self.default_jvm_args = args;
        }
        if let Some(locale) = patch.locale {
            self.locale = locale;
        }
        if let Some(profile_username) = patch.profile_username {
            self.profile_username = profile_username;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_sets_then_clears_profile_username() {
        let mut s = Settings::default();
        assert_eq!(s.profile_username, None);

        s.apply(Patch {
            profile_username: Some(Some("survivor".to_string())),
            ..Patch::default()
        });
        assert_eq!(s.profile_username, Some("survivor".to_string()));

        // Outer None leaves the username untouched.
        s.apply(Patch::default());
        assert_eq!(s.profile_username, Some("survivor".to_string()));

        // Some(None) explicitly clears it.
        s.apply(Patch {
            profile_username: Some(None),
            ..Patch::default()
        });
        assert_eq!(s.profile_username, None);
    }

    #[test]
    fn legacy_settings_without_username_deserialize_to_none() {
        // A pre-Phase-4 settings.json (no `profile_username` key) must still
        // load — the field is additive with a serde default.
        let json = r#"{
            "schema_version": 1,
            "steamcmd_path": null,
            "game_path": null,
            "default_jvm_args": [],
            "locale": "en"
        }"#;
        let s: Settings = serde_json::from_str(json).expect("legacy settings deserialize");
        assert_eq!(s.profile_username, None);
        assert_eq!(s.schema_version, SCHEMA_VERSION);
    }
}
