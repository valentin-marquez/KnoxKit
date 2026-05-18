//! SteamCMD job definitions.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `job::Job`.

use crate::domain::instance;

/// A unit of work submitted to the SteamCMD worker.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Job {
    /// Download (or update) a workshop item.
    DownloadMod {
        /// Steam workshop id.
        workshop_id: u64,
        /// Instance that requested it. `Some` → after the download lands in
        /// the shared cache, junction it into this instance; `None` → cache
        /// only, no per-instance link (e.g. a standalone verify/prefetch).
        instance_id: Option<instance::Id>,
    },
    /// Re-verify an already-downloaded workshop item.
    VerifyMod {
        /// Steam workshop id.
        workshop_id: u64,
    },
    /// Ask the worker to shut down cleanly.
    Shutdown,
}

impl Job {
    /// A stable correlation id for this job, used in emitted events.
    pub fn correlation_id(&self) -> String {
        match self {
            Job::DownloadMod { workshop_id, .. } => format!("download:{workshop_id}"),
            Job::VerifyMod { workshop_id } => format!("verify:{workshop_id}"),
            Job::Shutdown => "shutdown".to_string(),
        }
    }
}
