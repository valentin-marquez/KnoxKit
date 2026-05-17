//! Outbound application / IPC events.
//!
//! keep names path-relative — see docs/conventions.md
//!
//! `events::Event` (this type) is DISTINCT from `parser::Event` (a SteamCMD
//! parse result). The worker maps parser events onto these IPC events.
//!
//! All events are emitted on the single Tauri channel [`CHANNEL`] and are
//! serialized internally tagged so JS receives e.g.
//! `{ "type": "steamcmd_progress", "job_id": "...", "stage": "...", "percent": 42 }`.

use serde::Serialize;

/// The single Tauri event channel name every backend event is emitted on.
pub const CHANNEL: &str = "knoxkit://event";

/// An event pushed from the backend to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    /// Progress for a long-running SteamCMD job.
    SteamcmdProgress {
        /// Job correlation id.
        job_id: String,
        /// Coarse stage label (e.g. `"downloading"`).
        stage: String,
        /// Percent complete, 0..=100.
        percent: u8,
    },
    /// A job failed terminally.
    JobFailed {
        /// Job correlation id.
        job_id: String,
        /// Human-readable error.
        error: String,
    },
    /// A new instance was created.
    InstanceCreated {
        /// New instance id.
        id: String,
    },
}

/// Something capable of delivering an [`Event`] to the frontend.
///
/// Implemented by the real Tauri-backed emitter in `lib.rs` and by a capturing
/// mock in worker tests. `Send + Sync` so the worker task can hold it.
pub trait Emitter: Send + Sync {
    /// Deliver `event` to the frontend (best-effort; errors are logged).
    fn emit(&self, event: Event);
}

/// A Tauri-backed [`Emitter`] that emits on [`CHANNEL`].
pub struct TauriEmitter {
    /// Owned app handle used to reach all webviews.
    app: tauri::AppHandle,
}

impl TauriEmitter {
    /// Wrap a Tauri [`AppHandle`](tauri::AppHandle).
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }
}

impl Emitter for TauriEmitter {
    fn emit(&self, event: Event) {
        use tauri::Emitter as _;
        if let Err(e) = self.app.emit(CHANNEL, &event) {
            tracing::warn!("failed to emit event on {CHANNEL}: {e}");
        }
    }
}
