// keep in sync with src-tauri/src/domain/modpack.rs

export interface WorkshopItemRef {
  workshop_id: number;
  display_name: string;
  required: boolean;
  expected_hash: string;
  load_order: number;
}

export interface Manifest {
  schema_version: 1;
  format: "knoxpack";
  pack_id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  game_version: string;
  created_at: string;
  workshop_items: WorkshopItemRef[];
  mod_load_order: string[];
  map_load_order: string[];
  recommended_sandbox: Record<string, number>;
}
