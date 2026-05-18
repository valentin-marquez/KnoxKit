// keep in sync with src-tauri/src/domain/system.rs

/**
 * Physical-RAM snapshot driving the per-instance heap slider.
 *
 * All amounts are MB. `total_mb` is the machine's true physical RAM (never a
 * hardcoded cap); `default_mb` is the recommended new-instance heap;
 * `min_mb` is the slider floor. The launch-time hard-clamp lives on the
 * backend (`services::system::clamp_heap_mb`) and is not carried here.
 */
export interface Ram {
  total_mb: number;
  default_mb: number;
  min_mb: number;
}
