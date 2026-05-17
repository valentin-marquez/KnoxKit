//! Instance domain types.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `instance::Instance`, `instance::Id`, `instance::Input`.

use serde::{Deserialize, Serialize};

/// Current persisted schema version for [`Instance`].
pub const SCHEMA_VERSION: u32 = 1;

/// Stable instance identifier (uuid v4 rendered as a string).
pub type Id = String;

/// A self-contained Project Zomboid instance.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Instance {
    /// Persisted schema version.
    pub schema_version: u32,
    /// Unique id (uuid v4 string).
    pub id: Id,
    /// Human-readable instance name.
    pub name: String,
    /// Target game version string.
    pub game_version: String,
    /// JVM arguments applied on launch.
    pub jvm_args: Vec<String>,
    /// Creation timestamp, RFC3339.
    pub created_at: String,
    /// Last-played timestamp, RFC3339, if ever launched.
    pub last_played: Option<String>,
    /// Absolute path to the instance folder on disk.
    pub path: String,
}

/// User-supplied data required to create a new instance.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Input {
    /// Desired instance name.
    pub name: String,
    /// Target game version string.
    pub game_version: String,
    /// Optional JVM arguments (defaults to empty).
    #[serde(default)]
    pub jvm_args: Vec<String>,
}
