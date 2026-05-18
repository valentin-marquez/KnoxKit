//! Instance domain types.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `instance::Instance`, `instance::Id`, `instance::Input`,
//! `instance::Branch`, `instance::GameVersion`, `instance::Source`.

use serde::{Deserialize, Serialize};

/// Current persisted schema version for [`Instance`].
///
/// `2` introduced the structured [`GameVersion`] (replacing the old free
/// `game_version: String`) plus the optional modpack-identity / RAM fields.
/// Old `schema_version == 1` instances are migrated on read — see
/// `services::instances::disk`.
pub const SCHEMA_VERSION: u32 = 2;

/// Stable instance identifier (uuid v4 rendered as a string).
pub type Id = String;

/// Which Project Zomboid Steam branch an instance targets.
///
/// KnoxKit cannot *install* a branch (the Steam client owns app `108600`);
/// this is recorded **intent + a compatibility hint** used for display and the
/// detected-vs-intended comparison only. The `Other` arm is forward-compat for
/// future Steam branch names.
///
/// Wire shape (serde default, **externally tagged**, NO `rename_all` per
/// docs/conventions.md): the unit arms serialize as the bare PascalCase string
/// (`"Stable"`, `"Unstable"`, `"OutdatedUnstable"`) and the data arm as a
/// single-key object `{ "Other": "<name>" }`. The TS mirror in
/// `src/types/instance.ts` matches this byte-for-byte; a unit test below
/// freezes the exact JSON.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Branch {
    /// Default/`public` Steam branch — Build 41 stable (41.78.x).
    Stable,
    /// `unstable` Steam branch — Build 42 (rolling).
    Unstable,
    /// `outdatedunstable` Steam branch — previous B42 (save-compat).
    OutdatedUnstable,
    /// Any future/unknown Steam branch name, kept verbatim.
    Other(String),
}

impl Branch {
    /// The Steam branch name this maps to (`""` for the default branch).
    ///
    /// Used for display and the detected-vs-intended comparison only —
    /// KnoxKit never invokes SteamCMD on the game itself.
    pub fn steam_name(&self) -> &str {
        match self {
            Branch::Stable => "",
            Branch::Unstable => "unstable",
            Branch::OutdatedUnstable => "outdatedunstable",
            Branch::Other(s) => s.as_str(),
        }
    }

    /// A short human label including the Build family (e.g. `"41 (stable)"`).
    ///
    /// Used to project the structured value onto the `.knoxpack` manifest's
    /// `game_version: String` when no explicit build is known.
    pub fn display_label(&self) -> String {
        match self {
            Branch::Stable => "41 (stable)".to_string(),
            Branch::Unstable => "42 (unstable)".to_string(),
            Branch::OutdatedUnstable => "42 (outdated unstable)".to_string(),
            Branch::Other(s) => s.clone(),
        }
    }
}

/// PZ branch intent plus the advisory, runtime-discovered build string.
///
/// `branch` is persisted user intent; `build` (e.g. `"41.78.16"`) is an
/// advisory string discovered/refreshed from the detected install, never
/// authored. Replaces the old free `game_version: String`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameVersion {
    /// Which Steam branch this instance targets (recorded intent).
    pub branch: Branch,
    /// Advisory build string (e.g. `"41.78.16"`); `None` until discovered.
    pub build: Option<String>,
}

impl GameVersion {
    /// Project to a display string for the `.knoxpack` manifest
    /// (`build` if present, else the branch's [`Branch::display_label`]).
    pub fn manifest_string(&self) -> String {
        match &self.build {
            Some(b) if !b.trim().is_empty() => b.clone(),
            _ => self.branch.display_label(),
        }
    }

    /// Best-effort parse of a free-form / manifest version string back into a
    /// structured value. Mirrors the v1→v2 migration heuristic:
    /// `outdated` ⇒ [`Branch::OutdatedUnstable`]; `unstable`/`beta` ⇒
    /// [`Branch::Unstable`]; a leading `\d+\.\d` ⇒ [`Branch::Stable`] with the
    /// string kept as `build`; anything else ⇒ [`Branch::Stable`], no build.
    pub fn parse_loose(s: &str) -> GameVersion {
        let lower = s.to_lowercase();
        let looks_versioned = looks_like_build(s);
        let branch = if lower.contains("outdated") {
            Branch::OutdatedUnstable
        } else if lower.contains("unstable") || lower.contains("beta") {
            Branch::Unstable
        } else {
            Branch::Stable
        };
        let build = if looks_versioned {
            Some(s.trim().to_string())
        } else {
            None
        };
        GameVersion { branch, build }
    }
}

/// Whether `s` looks like a PZ build/version string — matches a leading
/// `<digits>.<digit>` (e.g. `41.78.16`, `42.1`). Pure, zero-IO, no regex crate.
fn looks_like_build(s: &str) -> bool {
    let s = s.trim();
    let mut chars = s.chars().peekable();
    // one-or-more leading digits
    if !matches!(chars.peek(), Some(c) if c.is_ascii_digit()) {
        return false;
    }
    while matches!(chars.peek(), Some(c) if c.is_ascii_digit()) {
        chars.next();
    }
    // a literal dot
    if chars.next() != Some('.') {
        return false;
    }
    // followed by at least one digit
    matches!(chars.next(), Some(c) if c.is_ascii_digit())
}

/// Link back to the managed pack an instance was instantiated from
/// (Prism-style). Enables update-vs-create on re-import (P3 surfaces it).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Source {
    /// Source kind discriminator (currently always `"knoxpack"`).
    pub kind: String,
    /// The originating pack's stable id.
    pub pack_id: String,
    /// The originating pack's version string.
    pub pack_version: String,
}

/// A self-contained Project Zomboid instance.
///
/// Schema v2: the only breaking change from v1 is `game_version`
/// (`String` → [`GameVersion`]); every other new field is optional/`None`
/// and round-trips losslessly (RAM is wired in P2, identity/icon in P3).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Instance {
    /// Persisted schema version.
    pub schema_version: u32,
    /// Unique id (uuid v4 string).
    pub id: Id,
    /// Human-readable instance name.
    pub name: String,
    /// Structured PZ branch intent + discovered build.
    pub game_version: GameVersion,
    /// JVM arguments applied on launch.
    pub jvm_args: Vec<String>,
    /// Creation timestamp, RFC3339.
    pub created_at: String,
    /// Last-played timestamp, RFC3339, if ever launched.
    pub last_played: Option<String>,
    /// Absolute path to the instance folder on disk.
    pub path: String,
    /// Per-instance JVM heap cap in MB; `None` ⇒ global/default (wired in P2).
    pub max_ram_mb: Option<u32>,
    /// Relative path to the instance icon (`icon.png`); `None` ⇒ no icon (P3).
    pub icon_path: Option<String>,
    /// Free-form description → manifest `description` (P3).
    pub description: Option<String>,
    /// Pack author → manifest `author` (P3).
    pub author: Option<String>,
    /// Pack version string → manifest `version`; lets re-export bump (P3).
    pub pack_version: Option<String>,
    /// Stable pack identity across versions → manifest `pack_id` (P3).
    pub pack_id: Option<String>,
    /// Managed-pack link this instance was instantiated from (P3).
    pub source: Option<Source>,
}

/// User-supplied data required to create a new instance.
///
/// Only `name` and `game_version` are required; every other field defaults
/// (`#[serde(default)]`) so `create_instance` stays backward-compatible and
/// future phases can populate the optional fields without a contract change.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Input {
    /// Desired instance name.
    pub name: String,
    /// Structured target game version (branch + optional build).
    pub game_version: GameVersion,
    /// Optional JVM arguments (defaults to empty).
    #[serde(default)]
    pub jvm_args: Vec<String>,
    /// Optional per-instance heap cap in MB (P2 surfaces this).
    #[serde(default)]
    pub max_ram_mb: Option<u32>,
    /// Optional relative icon path (P3 surfaces this).
    #[serde(default)]
    pub icon_path: Option<String>,
    /// Optional description (P3 surfaces this).
    #[serde(default)]
    pub description: Option<String>,
    /// Optional pack author (P3 surfaces this).
    #[serde(default)]
    pub author: Option<String>,
    /// Optional pack version (P3 surfaces this).
    #[serde(default)]
    pub pack_version: Option<String>,
    /// Optional stable pack id (P3 surfaces this).
    #[serde(default)]
    pub pack_id: Option<String>,
    /// Optional managed-pack source link (P3 surfaces this).
    #[serde(default)]
    pub source: Option<Source>,
    /// Optional absolute path to an image to copy in as the instance icon.
    ///
    /// This is the *source* to copy at create time — it is **not** persisted
    /// as-is. On create, if set, the file is copied to `<instance>/icon.png`
    /// and `Instance::icon_path` becomes `Some("icon.png")`. Additive and
    /// defaulted so `create_instance` stays backward-compatible (P3).
    #[serde(default)]
    pub icon_source_path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    /// Freeze the exact serialized JSON of every [`Branch`] arm so the
    /// `src/types/instance.ts` mirror stays byte-for-byte correct.
    #[test]
    fn branch_wire_shape_is_externally_tagged() {
        assert_eq!(
            serde_json::to_string(&Branch::Stable).expect("ser"),
            r#""Stable""#
        );
        assert_eq!(
            serde_json::to_string(&Branch::Unstable).expect("ser"),
            r#""Unstable""#
        );
        assert_eq!(
            serde_json::to_string(&Branch::OutdatedUnstable).expect("ser"),
            r#""OutdatedUnstable""#
        );
        assert_eq!(
            serde_json::to_string(&Branch::Other("legacy41".into())).expect("ser"),
            r#"{"Other":"legacy41"}"#
        );
        // round-trips
        let v = Branch::Other("future".into());
        let s = serde_json::to_string(&v).expect("ser");
        assert_eq!(serde_json::from_str::<Branch>(&s).expect("de"), v);
    }

    /// `GameVersion` is a flat `{ branch, build }` object on the wire.
    #[test]
    fn game_version_wire_shape() {
        let gv = GameVersion {
            branch: Branch::Stable,
            build: Some("41.78.16".into()),
        };
        assert_eq!(
            serde_json::to_string(&gv).expect("ser"),
            r#"{"branch":"Stable","build":"41.78.16"}"#
        );
        let none = GameVersion {
            branch: Branch::Unstable,
            build: None,
        };
        assert_eq!(
            serde_json::to_string(&none).expect("ser"),
            r#"{"branch":"Unstable","build":null}"#
        );
    }

    #[test]
    fn parse_loose_maps_known_strings() {
        assert_eq!(
            GameVersion::parse_loose("41.78.16"),
            GameVersion {
                branch: Branch::Stable,
                build: Some("41.78.16".into())
            }
        );
        assert_eq!(
            GameVersion::parse_loose("42 (unstable)"),
            GameVersion {
                branch: Branch::Unstable,
                build: None
            }
        );
        assert_eq!(
            GameVersion::parse_loose("beta"),
            GameVersion {
                branch: Branch::Unstable,
                build: None
            }
        );
        assert_eq!(
            GameVersion::parse_loose("42 (outdated unstable)"),
            GameVersion {
                branch: Branch::OutdatedUnstable,
                build: None
            }
        );
        assert_eq!(
            GameVersion::parse_loose(""),
            GameVersion {
                branch: Branch::Stable,
                build: None
            }
        );
    }

    #[test]
    fn looks_like_build_heuristic() {
        assert!(looks_like_build("41.78.16"));
        assert!(looks_like_build("42.1"));
        assert!(looks_like_build("  42.0  "));
        assert!(!looks_like_build("beta"));
        assert!(!looks_like_build("41"));
        assert!(!looks_like_build("v41.78"));
        assert!(!looks_like_build(""));
    }
}
