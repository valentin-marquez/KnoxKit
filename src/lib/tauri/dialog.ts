import { open } from "@tauri-apps/plugin-dialog";

/**
 * Thin wrappers over the native Tauri file dialog. This is the only place the
 * frontend touches `@tauri-apps/plugin-dialog`; components call these instead
 * of importing the plugin, keeping the boundary rule intact.
 *
 * keep in sync with the dialog plugin registered in src-tauri/src/lib.rs
 */

/** Pick a single existing file. Returns the absolute path, or null if cancelled. */
export async function pickFile(): Promise<string | null> {
  const picked = await open({ multiple: false, directory: false });
  return typeof picked === "string" ? picked : null;
}

/** Pick a single directory. Returns the absolute path, or null if cancelled. */
export async function pickDirectory(): Promise<string | null> {
  const picked = await open({ multiple: false, directory: true });
  return typeof picked === "string" ? picked : null;
}
