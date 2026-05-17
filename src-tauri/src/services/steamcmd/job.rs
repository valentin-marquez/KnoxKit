//! SteamCMD job definitions.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `job::Job`.

/// A unit of work submitted to the SteamCMD worker.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Job {
    /// Download (or update) a workshop item.
    DownloadMod {
        /// Steam workshop id.
        workshop_id: u64,
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
            Job::DownloadMod { workshop_id } => format!("download:{workshop_id}"),
            Job::VerifyMod { workshop_id } => format!("verify:{workshop_id}"),
            Job::Shutdown => "shutdown".to_string(),
        }
    }
}
