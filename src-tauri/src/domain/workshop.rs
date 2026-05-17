//! Workshop domain types.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `workshop::WorkshopRef`.

use serde::{Deserialize, Serialize};

/// A reference to a single Steam Workshop item.
///
/// Steam published-file ids are well below 2^53 so serializing `u64` over JSON
/// IPC is safe.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkshopRef {
    /// Steam published-file id.
    pub id: u64,
}
