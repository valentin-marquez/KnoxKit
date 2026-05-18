//! Service layer: async + IO + business logic.
//!
//! keep names path-relative — see docs/conventions.md
//!
//! Services NEVER import `commands/`. Callers write `instances::disk::list`,
//! `steamcmd::worker::Worker`, `workshop::url::parse`, `modpack::export::run`.

pub mod instances;
pub mod modpack;
pub mod setup;
pub mod steamcmd;
pub mod system;
pub mod workshop;
