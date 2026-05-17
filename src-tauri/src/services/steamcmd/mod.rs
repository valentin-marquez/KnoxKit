//! SteamCMD integration service: process worker, output parser, jobs.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `steamcmd::worker::Worker`, `steamcmd::parser::parse_line`,
//! `steamcmd::job::Job`.

pub mod job;
pub mod parser;
pub mod worker;
