//! Steam Workshop service: url/id parsing, content cache, mod.info scan.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `workshop::url::parse`, `workshop::cache::ingest`,
//! `workshop::modinfo::parse`.

pub mod cache;
pub mod modinfo;
pub mod url;
