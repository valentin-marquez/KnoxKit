// keep in sync with src-tauri/src/domain/settings.rs

export interface Settings {
  schema_version: number;
  steamcmd_path: string | null;
  game_path: string | null;
  default_jvm_args: string[];
  locale: "en" | "es-CL";
  profile_username: string | null;
}

// `profile_username` is a double-`Option` on the Rust side: an absent key
// leaves the stored value untouched, an explicit `null` clears it, and a
// string sets it. `Partial` models "absent key" via the optional `?`, and the
// `string | null` value carries the set/clear distinction — so the wire shape
// lines up with `settings::Patch` without any extra encoding.
export type Patch = Partial<Omit<Settings, "schema_version">>;
