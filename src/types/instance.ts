// keep in sync with src-tauri/src/domain/instance.rs

export type Id = string; // uuid v4

/**
 * Which Project Zomboid Steam branch an instance targets.
 *
 * Mirrors the serde **externally-tagged** enum byte-for-byte (NO
 * `rename_all` per docs/conventions.md): the unit arms are the bare
 * PascalCase string; the data arm is a single-key object. Frozen by the
 * `branch_wire_shape_is_externally_tagged` Rust test:
 *   Stable            → "Stable"
 *   Unstable          → "Unstable"
 *   OutdatedUnstable  → "OutdatedUnstable"
 *   Other(s)          → { "Other": s }
 */
export type Branch = "Stable" | "Unstable" | "OutdatedUnstable" | { Other: string };

/** PZ branch intent plus the advisory, runtime-discovered build string. */
export interface GameVersion {
  branch: Branch;
  build: string | null;
}

/** Managed-pack link this instance was instantiated from (P3 surfaces it). */
export interface Source {
  kind: string;
  pack_id: string;
  pack_version: string;
}

export interface Instance {
  schema_version: number;
  id: Id;
  name: string;
  game_version: GameVersion;
  jvm_args: string[];
  created_at: string;
  last_played: string | null;
  path: string;
  max_ram_mb: number | null;
  icon_path: string | null;
  description: string | null;
  author: string | null;
  pack_version: string | null;
  pack_id: string | null;
  source: Source | null;
}

export interface Input {
  name: string;
  game_version: GameVersion;
  jvm_args?: string[];
  max_ram_mb?: number | null;
  icon_path?: string | null;
  description?: string | null;
  author?: string | null;
  pack_version?: string | null;
  pack_id?: string | null;
  source?: Source | null;
  /**
   * Absolute path to an image to copy in as the instance icon at create
   * time. The *source* to copy — not persisted as-is; the backend copies it
   * to `<instance>/icon.png` and sets `icon_path`.
   */
  icon_source_path?: string | null;
}

/** Render a {@link Branch} as a short human label (matches Rust's labels). */
export function branchLabel(b: Branch): string {
  if (typeof b === "object") return b.Other;
  switch (b) {
    case "Stable":
      return "B41 (stable)";
    case "Unstable":
      return "B42 (unstable)";
    case "OutdatedUnstable":
      return "B42 (outdated unstable)";
  }
}

/** One-line display of a {@link GameVersion}: build if known, else branch. */
export function gameVersionLabel(gv: GameVersion): string {
  if (gv.build && gv.build.trim() !== "") return gv.build;
  return branchLabel(gv.branch);
}
