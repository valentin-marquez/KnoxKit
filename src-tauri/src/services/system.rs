//! Host system info service (physical RAM).
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `system::total_ram_mb`, `system::recommended_default_mb`,
//! `system::min_mb`, `system::clamp_heap_mb`, `system::snapshot`.
//!
//! This is the **only** place the real machine is read. The actual `sysinfo`
//! call is isolated in [`total_ram_mb`]; every policy decision below is a pure
//! arithmetic helper so it is unit-tested against synthetic totals (the test
//! suite never depends on the host's real RAM). Policy is frozen by
//! docs/instance-redesign.md §4.

use crate::domain::system::Ram;

/// Slider floor — the minimum heap a user may pick, in MB (docs §4: 2048).
const MIN_MB: u32 = 2048;

/// Off-heap headroom reserved for the OS + PZ's LWJGL/GL allocations, in MB.
/// The launch hard-clamp keeps `total - HEADROOM_MB` available (docs §4).
const HEADROOM_MB: u64 = 2048;

/// Lower bound of the recommended new-instance default, in MB (docs §4).
const DEFAULT_FLOOR_MB: u32 = 3072;

/// Upper bound of the recommended new-instance default, in MB (docs §4).
const DEFAULT_CEIL_MB: u32 = 8192;

/// Read this machine's **true** physical RAM total, in MB.
///
/// The single isolated `sysinfo` touch: refreshes memory only (no CPU / disk
/// / process scan — `default-features = false, features = ["system"]`).
/// Returns `None` only if the reported total is zero (treated as "unknown" so
/// callers fall back to a conservative default rather than dividing by it).
pub fn total_ram_mb() -> Option<u64> {
    use sysinfo::{MemoryRefreshKind, RefreshKind, System};

    let sys = System::new_with_specifics(
        RefreshKind::nothing().with_memory(MemoryRefreshKind::nothing().with_ram()),
    );
    let bytes = sys.total_memory();
    if bytes == 0 {
        return None;
    }
    Some(bytes / (1024 * 1024))
}

/// The slider floor in MB (docs §4: a flat 2048).
///
/// Pure, zero-IO. A free fn (not a const) so the contract is one place and
/// the [`Ram`] DTO + the frontend slider read the same value.
pub fn min_mb() -> u32 {
    MIN_MB
}

/// Round `mb` down to the nearest 512 MB step. Pure, zero-IO.
fn round_to_512(mb: u64) -> u64 {
    (mb / 512) * 512
}

/// Recommended default heap for a **new** instance, in MB.
///
/// Policy (docs §4): `clamp(round512(total * 0.5), 3072, 8192)`. Pure,
/// zero-IO; `total_mb` is fed synthetically by the unit tests.
pub fn recommended_default_mb(total_mb: u64) -> u32 {
    let half = round_to_512(total_mb / 2);
    let half = u32::try_from(half).unwrap_or(u32::MAX);
    half.clamp(DEFAULT_FLOOR_MB, DEFAULT_CEIL_MB)
}

/// Launch hard-clamp: the largest heap that may actually be passed to PZ.
///
/// Policy (docs §4): `min(req, total - 2048, total * 0.90)` — PZ's LWJGL/GL
/// allocations live off-heap, so the JVM heap must never claim the whole
/// machine. Pure, zero-IO. Never returns more than `req`, and never below
/// [`min_mb`] unless the machine is genuinely tiny (then it returns the
/// smaller machine-derived bound — best effort on hardware we cannot serve).
pub fn clamp_heap_mb(req: u32, total_mb: u64) -> u32 {
    let by_headroom = total_mb.saturating_sub(HEADROOM_MB);
    let by_ratio = (total_mb * 9) / 10;
    let machine_cap = u32::try_from(by_headroom.min(by_ratio)).unwrap_or(u32::MAX);
    req.min(machine_cap)
}

/// Build the [`Ram`] DTO from the real machine (or a conservative fallback).
///
/// The only IO path: reads [`total_ram_mb`] once. If the total is unknown the
/// snapshot reports the default-ceiling as the total and the recommended
/// default — enough for the slider to function without ever fabricating a
/// machine larger than we can verify.
pub fn snapshot() -> Ram {
    match total_ram_mb() {
        Some(total) => Ram {
            total_mb: total,
            default_mb: recommended_default_mb(total),
            min_mb: min_mb(),
        },
        None => {
            let total = u64::from(DEFAULT_CEIL_MB);
            Ram {
                total_mb: total,
                default_mb: recommended_default_mb(total),
                min_mb: min_mb(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn round_to_512_floors_to_step() {
        assert_eq!(round_to_512(0), 0);
        assert_eq!(round_to_512(511), 0);
        assert_eq!(round_to_512(512), 512);
        assert_eq!(round_to_512(1023), 512);
        assert_eq!(round_to_512(8191), 7680);
    }

    #[test]
    fn recommended_default_clamps_low_and_high() {
        // 4 GB machine → half = 2048 → clamped up to the 3072 floor.
        assert_eq!(recommended_default_mb(4096), 3072);
        // 8 GB → half = 4096 (in range).
        assert_eq!(recommended_default_mb(8192), 4096);
        // 32 GB → half = 16384 → clamped down to the 8192 ceiling.
        assert_eq!(recommended_default_mb(32768), 8192);
        // round-to-512 applies before the clamp: 13000/2 = 6500 → 6144.
        assert_eq!(recommended_default_mb(13000), 6144);
    }

    #[test]
    fn min_mb_is_2048() {
        assert_eq!(min_mb(), 2048);
    }

    #[test]
    fn clamp_heap_never_exceeds_request() {
        // Plenty of RAM, modest request → request returned untouched.
        assert_eq!(clamp_heap_mb(4096, 32768), 4096);
    }

    #[test]
    fn clamp_heap_applies_headroom_bound() {
        // 16 GB total, ask for 15 GB. headroom bound = 16384-2048 = 14336;
        // ratio bound = 14745; min = 14336 → request clamped to 14336.
        assert_eq!(clamp_heap_mb(15360, 16384), 14336);
    }

    #[test]
    fn clamp_heap_applies_ratio_bound_on_small_machines() {
        // 4 GB total, ask for 4 GB. headroom = 2048; ratio = 3686;
        // min = 2048 → clamped to 2048.
        assert_eq!(clamp_heap_mb(4096, 4096), 2048);
    }

    #[test]
    fn snapshot_is_internally_consistent() {
        // Does touch the host, but only asserts invariants that hold for any
        // real or fallback machine — never the host's exact RAM.
        let r = snapshot();
        assert_eq!(r.min_mb, 2048);
        assert!(r.total_mb > 0);
        assert!(r.default_mb >= DEFAULT_FLOOR_MB || u64::from(r.default_mb) <= r.total_mb);
        assert!(r.default_mb <= DEFAULT_CEIL_MB);
    }
}
