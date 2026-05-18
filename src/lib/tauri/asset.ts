import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Thin wrapper over Tauri's asset-protocol URL conversion. This is the only
 * place the frontend touches `convertFileSrc`; components call this instead
 * of importing `@tauri-apps/api/core` directly, keeping the boundary rule
 * intact (components reach Tauri only via `@/lib/tauri/*`).
 *
 * NOTE: the webview can only load the returned URL if the path is inside the
 * `app.security.assetProtocol.scope` allowlist in `src-tauri/tauri.conf.json`
 * (currently empty — see NOTES.md). Scope widening is an orchestrator config
 * concern; this wrapper is correct regardless.
 *
 * keep in sync with the asset protocol enabled in src-tauri/tauri.conf.json
 */

/** Convert an absolute filesystem path into an `asset://` URL the webview can load. */
export function assetUrl(path: string): string {
  return convertFileSrc(path);
}
