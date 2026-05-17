//! Pure domain types.
//!
//! keep names path-relative — see docs/conventions.md
//!
//! This module and everything under it is **pure**: zero IO, zero `tauri` and
//! zero `tokio` dependencies. Types here serialize over Tauri IPC to the TS
//! frontend using serde defaults (snake_case field names, NO `rename_all`).

pub mod instance;
pub mod mod_collection;
pub mod modpack;
pub mod settings;
pub mod workshop;
