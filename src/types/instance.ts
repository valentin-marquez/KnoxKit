// keep in sync with src-tauri/src/domain/instance.rs

export type Id = string; // uuid v4

export interface Instance {
  schema_version: number;
  id: Id;
  name: string;
  game_version: string;
  jvm_args: string[];
  created_at: string;
  last_played: string | null;
  path: string;
}

export interface Input {
  name: string;
  game_version: string;
  jvm_args?: string[];
}
