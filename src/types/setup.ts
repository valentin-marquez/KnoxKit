// keep in sync with src-tauri/src/domain/setup.rs

/**
 * First-run onboarding status. `needs_onboarding` is true until the Project
 * Zomboid game path, the SteamCMD executable path, and a non-empty profile
 * username are all configured; the hard gate redirects to `/onboarding` until
 * it flips to false. The profile username is a required onboarding step (it is
 * the authoritative source for every instance's author).
 */
export interface Status {
  needs_onboarding: boolean;
  game_path: string | null;
  steamcmd_path: string | null;
  profile_username: string | null;
}
