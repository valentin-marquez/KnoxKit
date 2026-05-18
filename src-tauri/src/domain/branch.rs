//! Branch-info DTO returned by the `list_branches` command.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `branch::Info`, `branch::fallback`.
//!
//! This is the wire shape the create dialog's branch `<Select>` consumes. It
//! pairs a structured [`instance::Branch`] (the persisted intent) with the raw
//! Steam metadata read from `app_info_print` so the UI can show Valve's own
//! branch description when present. Serde defaults (snake_case, NO
//! `rename_all`); mirrored byte-for-byte by `src/types/branch.ts`.

use serde::{Deserialize, Serialize};

use crate::domain::instance;

/// One selectable Project Zomboid branch with its Steam metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Info {
    /// The structured branch this maps to (what gets persisted on the
    /// instance's `game_version.branch`).
    pub branch: instance::Branch,
    /// Raw Steam branch key (`public`, `unstable`, `outdatedunstable`, …).
    pub steam_name: String,
    /// Valve's branch description; absent on `public`, present on betas.
    pub description: Option<String>,
    /// `buildid` scalar from `app_info_print`, when available.
    pub build_id: Option<String>,
}

/// Map a raw Steam branch key to a structured [`instance::Branch`].
///
/// `public→Stable`, `unstable→Unstable`, `outdatedunstable→OutdatedUnstable`,
/// anything else → [`instance::Branch::Other`] (forward-compat).
pub fn map_branch(steam_name: &str) -> instance::Branch {
    match steam_name {
        "public" => instance::Branch::Stable,
        "unstable" => instance::Branch::Unstable,
        "outdatedunstable" => instance::Branch::OutdatedUnstable,
        other => instance::Branch::Other(other.to_string()),
    }
}

/// The static fallback branch list — used whenever SteamCMD is unavailable,
/// times out, or returns nothing. Never empty, so the UI always has options.
///
/// `steam_name` uses the canonical keys (`public`/`unstable`/
/// `outdatedunstable`); descriptions are left `None` (the UI falls back to its
/// localized branch labels).
pub fn fallback() -> Vec<Info> {
    vec![
        Info {
            branch: instance::Branch::Stable,
            steam_name: "public".to_string(),
            description: None,
            build_id: None,
        },
        Info {
            branch: instance::Branch::Unstable,
            steam_name: "unstable".to_string(),
            description: None,
            build_id: None,
        },
        Info {
            branch: instance::Branch::OutdatedUnstable,
            steam_name: "outdatedunstable".to_string(),
            description: None,
            build_id: None,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn maps_known_and_unknown_branch_keys() {
        assert_eq!(map_branch("public"), instance::Branch::Stable);
        assert_eq!(map_branch("unstable"), instance::Branch::Unstable);
        assert_eq!(
            map_branch("outdatedunstable"),
            instance::Branch::OutdatedUnstable
        );
        assert_eq!(
            map_branch("legacy41"),
            instance::Branch::Other("legacy41".to_string())
        );
    }

    #[test]
    fn fallback_is_the_static_three() {
        let f = fallback();
        assert_eq!(f.len(), 3);
        assert_eq!(f[0].branch, instance::Branch::Stable);
        assert_eq!(f[0].steam_name, "public");
        assert_eq!(f[1].steam_name, "unstable");
        assert_eq!(f[2].steam_name, "outdatedunstable");
        assert!(f.iter().all(|b| b.description.is_none()));
    }

    /// Freeze the wire shape so `src/types/branch.ts` stays correct.
    #[test]
    fn info_wire_shape_is_snake_case() {
        let info = Info {
            branch: instance::Branch::Unstable,
            steam_name: "unstable".to_string(),
            description: Some("Latest Build 42".to_string()),
            build_id: Some("23177452".to_string()),
        };
        assert_eq!(
            serde_json::to_string(&info).expect("ser"),
            r#"{"branch":"Unstable","steam_name":"unstable","description":"Latest Build 42","build_id":"23177452"}"#
        );
    }
}
