//! Instance management service (disk-backed persistence).
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `instances::disk::list`, etc.

pub mod disk;
pub mod launch;
pub mod pz;
pub mod pzexe;
