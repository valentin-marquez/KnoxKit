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
    }
}
