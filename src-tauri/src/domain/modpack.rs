//! Modpack manifest domain types ("knoxpack" format).
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `modpack::Manifest`, `modpack::WorkshopItemRef`,
//! `modpack::OverrideKind`. The frontend's `src/types/modpack.ts` mirrors
//! [`Manifest`].

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// Current knoxpack manifest schema version.
pub const SCHEMA_VERSION: u32 = 1;

/// Canonical `format` discriminator string.
pub const FORMAT: &str = "knoxpack";

/// A workshop item required by a modpack.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkshopItemRef {
    /// Steam workshop id.
    pub workshop_id: u64,
    /// Friendly display name shown in the UI.
    pub display_name: String,
    /// Whether the pack hard-requires this item.
    pub required: bool,
    /// Expected `sha256:<hex>` (or `"sha256:unknown"`) of the cached zip.
    pub expected_hash: String,
    /// Position in the workshop load order (must be unique within a pack).
    pub load_order: u32,
}

/// A full modpack manifest, serialized to `knoxpack.json` inside the archive.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Manifest {
    /// Manifest schema version (currently always `1`).
    pub schema_version: u32,
    /// Format discriminator, always `"knoxpack"`.
    pub format: String,
    /// Stable pack identifier (uuid v4 string).
    pub pack_id: String,
    /// Pack display name.
    pub name: String,
    /// Pack version string (free-form, author controlled).
    pub version: String,
    /// Pack author.
    pub author: String,
    /// Free-form description.
    pub description: String,
    /// Target Project Zomboid game version.
    pub game_version: String,
    /// Creation timestamp, RFC3339.
    pub created_at: String,
    /// Workshop items the pack ships.
    pub workshop_items: Vec<WorkshopItemRef>,
    /// In-game mod load order.
    pub mod_load_order: Vec<String>,
    /// Map load order.
    pub map_load_order: Vec<String>,
    /// Recommended sandbox settings (opaque key/value tree).
    pub recommended_sandbox: BTreeMap<String, serde_json::Value>,
}

/// The whitelist of override kinds a modpack may ship. Anything not in this
/// enum is rejected on import.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum OverrideKind {
    /// `overrides/jvm-args.txt`
    JvmArgs,
    /// `overrides/servertest.ini`
    ServerTest,
    /// `overrides/serverconfig/<name>.ini`
    ServerConfig(String),
}
