// keep in sync with src-tauri/src/domain/branch.rs

import type { Branch } from "@/types/instance";

/**
 * One selectable Project Zomboid branch with its Steam metadata, as returned
 * by the `list_branches` command. Mirrors `branch::Info` byte-for-byte
 * (serde default snake_case, NO `rename_all`; frozen by the
 * `info_wire_shape_is_snake_case` Rust test).
 *
 * `description` is Valve's branch description — absent (`null`) on `public`,
 * present on the beta branches. The backend always resolves this to a
 * non-empty list (it falls back to the static three on any failure), so a
 * consumer never has to handle an empty result.
 */
export interface Info {
  /** Structured branch this maps to (persisted on `game_version.branch`). */
  branch: Branch;
  /** Raw Steam branch key (`public`, `unstable`, `outdatedunstable`, …). */
  steam_name: string;
  /** Valve's branch description; `null` on `public`. */
  description: string | null;
  /** `buildid` scalar from `app_info_print`, when available. */
  build_id: string | null;
}
