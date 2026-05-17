// keep in sync with src-tauri/src/domain/mod_collection.rs

import type { Id } from "@/types/instance";

export interface ModEntry {
  workshop_id: number;
  mod_ids: string[];
  enabled: boolean;
}

export interface Collection {
  instance_id: Id;
  workshop_ids: number[];
  mods: ModEntry[];
  mod_load_order: string[];
}
