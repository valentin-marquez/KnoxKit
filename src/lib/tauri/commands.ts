import { invoke } from "@tauri-apps/api/core";
import type { Id, Input, Instance } from "@/types/instance";
import type { Collection } from "@/types/mod-collection";
import type { Manifest } from "@/types/modpack";
import type { Patch, Settings } from "@/types/settings";
import type { Status as SetupStatus } from "@/types/setup";
import type { Ram } from "@/types/system";
import type { WorkshopRef } from "@/types/workshop";

/**
 * Typed wrappers over Tauri `invoke`. Command names are snake_case (Rust side);
 * argument keys are camelCase because Tauri converts Rust snake_case params to
 * camelCase JS by default.
 */

/** List all known instances. */
export function listInstances(): Promise<Instance[]> {
  return invoke<Instance[]>("list_instances");
}

/** Fetch a single instance by id. */
export function getInstance(id: Id): Promise<Instance> {
  return invoke<Instance>("get_instance", { id });
}

/** Create a new instance from user input. */
export function createInstance(input: Input): Promise<Instance> {
  return invoke<Instance>("create_instance", { input });
}

/** Delete an instance by id. */
export function deleteInstance(id: Id): Promise<void> {
  return invoke<void>("delete_instance", { id });
}

/** Launch the game for the given instance. */
export function launchInstance(id: Id): Promise<void> {
  return invoke<void>("launch_instance", { id });
}

/** Set (or replace) an instance's icon from a local image file path. */
export function setInstanceIcon(id: Id, srcPath: string): Promise<Instance> {
  return invoke<Instance>("set_instance_icon", { id, srcPath });
}

/** List the mod collection for an instance. */
export function listMods(instanceId: Id): Promise<Collection> {
  return invoke<Collection>("list_mods", { instanceId });
}

/** Import a Steam Workshop collection (URL or id) into an instance. */
export function importWorkshopCollection(instanceId: Id, urlOrId: string): Promise<void> {
  return invoke<void>("import_workshop_collection", { instanceId, urlOrId });
}

/** Enable or disable a workshop mod for an instance. */
export function toggleMod(instanceId: Id, workshopId: number, enabled: boolean): Promise<void> {
  return invoke<void>("toggle_mod", { instanceId, workshopId, enabled });
}

/** Parse a Steam Workshop URL into a workshop reference. */
export function parseWorkshopUrl(url: string): Promise<WorkshopRef> {
  return invoke<WorkshopRef>("parse_workshop_url", { url });
}

/** Read this machine's physical-RAM snapshot for the heap slider. */
export function getSystemRam(): Promise<Ram> {
  return invoke<Ram>("get_system_ram");
}

/** Read the application settings. */
export function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

/** Apply a partial patch to the application settings. */
export function updateSettings(patch: Patch): Promise<Settings> {
  return invoke<Settings>("update_settings", { patch });
}

/** Export an instance as a .knoxpack modpack to the given path. */
export function exportModpack(instanceId: Id, outputPath: string): Promise<void> {
  return invoke<void>("export_modpack", { instanceId, outputPath });
}

/** Import a .knoxpack file as a new instance, returning its id. */
export function importModpack(packPath: string, targetName: string): Promise<Id> {
  return invoke<Id>("import_modpack", { packPath, targetName });
}

/** Validate a .knoxpack file and return its manifest. */
export function validateModpack(packPath: string): Promise<Manifest> {
  return invoke<Manifest>("validate_modpack", { packPath });
}

/** Read the first-run onboarding status (derived from settings). */
export function getSetupStatus(): Promise<SetupStatus> {
  return invoke<SetupStatus>("get_setup_status");
}

/** Auto-detect the Project Zomboid install path (Steam scan); null if absent. */
export function detectGamePath(): Promise<string | null> {
  return invoke<string | null>("detect_game_path");
}

/** Validate + persist the Project Zomboid install path; returns new status. */
export function setGamePath(path: string): Promise<SetupStatus> {
  return invoke<SetupStatus>("set_game_path", { path });
}

/** Resolve an already-available SteamCMD path; null if none is installed. */
export function detectSteamcmd(): Promise<string | null> {
  return invoke<string | null>("detect_steamcmd");
}

/** Install SteamCMD in-app (download + extract + bootstrap); returns its path. */
export function installSteamcmd(): Promise<string> {
  return invoke<string>("install_steamcmd");
}

/** Reset settings to defaults; re-triggers first-run onboarding. */
export function resetSetup(): Promise<SetupStatus> {
  return invoke<SetupStatus>("reset_setup");
}
