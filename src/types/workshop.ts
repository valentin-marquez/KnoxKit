// keep in sync with src-tauri/src/domain/workshop.rs

// Steam workshop IDs are ~10 digits, safely within JS number range (< 2^53).
export interface WorkshopRef {
  id: number;
}
