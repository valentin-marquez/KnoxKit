//! Host system info domain types (RAM).
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `system::Ram`.
//!
//! Pure: zero IO, zero async, zero `tauri`. Mirrored on the frontend by
//! `src/types/system.ts` (snake_case wire fields, serde defaults, NO
//! `rename_all` per docs/conventions.md). The numbers are produced by
//! `services::system` (the only place the actual machine is read).

use serde::{Deserialize, Serialize};

/// Physical-RAM snapshot used to drive the per-instance heap slider.
///
/// All amounts are **MB** (mebibyte-ish; `sysinfo` reports bytes, the service
/// divides by `1024*1024`). `total_mb` is the true machine total (never a
/// hardcoded cap — v1's bug); `default_mb` is the recommended new-instance
/// heap; `min_mb` is the slider floor. The launch hard-clamp is applied
/// separately in `services::system::clamp_heap_mb` and is **not** carried here
/// (it depends on the user's requested value).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ram {
    /// True physical RAM total of this machine, in MB.
    pub total_mb: u64,
    /// Recommended default heap for a new instance, in MB.
    pub default_mb: u32,
    /// Slider floor (minimum selectable heap), in MB.
    pub min_mb: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn serializes_snake_case() {
        let json = serde_json::to_string(&Ram {
            total_mb: 16384,
            default_mb: 8192,
            min_mb: 2048,
        })
        .expect("serialize");
        assert_eq!(
            json,
            r#"{"total_mb":16384,"default_mb":8192,"min_mb":2048}"#
        );
    }
}
