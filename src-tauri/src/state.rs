//! Shared, Tauri-managed application state.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `state::State`.

use crate::services::steamcmd::worker::JobSender;

/// Application state managed by Tauri and injected into every command.
///
/// Holds the channel used to submit jobs to the long-running SteamCMD worker.
/// Designed to grow (add more fields as services come online).
pub struct State {
    /// Sender half of the SteamCMD job channel.
    pub steamcmd: JobSender,
}

impl State {
    /// Build state from the SteamCMD job sender.
    pub fn new(steamcmd: JobSender) -> Self {
        Self { steamcmd }
    }
}
