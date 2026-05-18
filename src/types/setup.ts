// keep in sync with src-tauri/src/domain/setup.rs

/**
 * First-run onboarding status. `needs_onboarding` is true until both the
 * Project Zomboid game path and the SteamCMD executable path are configured;
 * the hard gate redirects to `/onboarding` until it flips to false.
 */
export interface Status {
  needs_onboarding: boolean;
  game_path: string | null;
  steamcmd_path: string | null;
}
