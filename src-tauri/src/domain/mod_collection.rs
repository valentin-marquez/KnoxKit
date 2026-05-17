//! Per-instance mod collection domain types.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `mod_collection::Collection`, `mod_collection::ModEntry`.

use serde::{Deserialize, Serialize};

use crate::domain::instance;

/// A single workshop item plus the in-game mod ids it provides.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModEntry {
    /// Steam workshop id this entry was downloaded from.
    pub workshop_id: u64,
    /// In-game mod ids contributed by this workshop item.
    pub mod_ids: Vec<String>,
    /// Whether the mod is currently enabled.
    pub enabled: bool,
}

/// The full set of mods configured for one instance.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Collection {
    /// Owning instance id.
    pub instance_id: instance::Id,
    /// All subscribed workshop ids.
    pub workshop_ids: Vec<u64>,
    /// Resolved mod entries.
    pub mods: Vec<ModEntry>,
    /// Ordered list of in-game mod ids (Project Zomboid load order).
    pub mod_load_order: Vec<String>,
}

impl Collection {
    /// An empty collection for `instance_id` (used when `mods.json` is absent).
    pub fn empty(instance_id: instance::Id) -> Self {
        Self {
            instance_id,
            workshop_ids: Vec::new(),
            mods: Vec::new(),
            mod_load_order: Vec::new(),
        }
    }
}
