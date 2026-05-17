// keep in sync with src-tauri/src/domain/settings.rs

export interface Settings {
  schema_version: number;
  steamcmd_path: string | null;
  game_path: string | null;
  default_jvm_args: string[];
  locale: "en" | "es-CL";
}

export type Patch = Partial<Omit<Settings, "schema_version">>;
