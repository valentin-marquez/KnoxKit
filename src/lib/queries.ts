/**
 * TanStack Query hooks over the typed Tauri command wrappers. This is the
 * only place the UI touches the backend: components consume these hooks,
 * never `@/lib/tauri/commands` or `@tauri-apps/api` directly.
 *
 * Architecture rule: a mutation calls its command, then invalidates the
 * affected query so the next read comes back from disk (the source of truth).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createInstance,
  deleteInstance,
  detectGamePath,
  detectSteamcmd,
  getInstance,
  getSettings,
  getSetupStatus,
  getSystemRam,
  installSteamcmd,
  launchInstance,
  listBranches,
  listInstances,
  listMods,
  resetSetup,
  setGamePath,
  setInstanceIcon,
  toggleMod,
  updateSettings,
} from "@/lib/tauri/commands";
import type { Info as BranchInfo } from "@/types/branch";
import type { Id, Input, Instance } from "@/types/instance";
import type { Collection } from "@/types/mod-collection";
import type { Patch, Settings } from "@/types/settings";
import type { Status as SetupStatus } from "@/types/setup";
import type { Ram } from "@/types/system";

/** Centralized query keys — every hook and invalidation reads from here. */
export const keys = {
  instances: ["instances"] as const,
  instance: (id: Id) => ["instance", id] as const,
  mods: (id: Id) => ["mods", id] as const,
  settings: ["settings"] as const,
  setup: ["setup"] as const,
  systemRam: ["system", "ram"] as const,
  branches: ["branches"] as const,
};

/** All known instances. */
export function useInstances() {
  return useQuery<Instance[]>({
    queryKey: keys.instances,
    queryFn: listInstances,
  });
}

/** A single instance by id. */
export function useInstance(id: Id) {
  return useQuery<Instance>({
    queryKey: keys.instance(id),
    queryFn: () => getInstance(id),
  });
}

/** Mod collection for an instance. */
export function useInstanceMods(id: Id) {
  return useQuery<Collection>({
    queryKey: keys.mods(id),
    queryFn: () => listMods(id),
  });
}

/** Create an instance, then refresh the list from disk. */
export function useCreateInstance() {
  const qc = useQueryClient();
  return useMutation<Instance, Error, Input>({
    mutationFn: (input) => createInstance(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.instances });
    },
  });
}

/** Delete an instance, then refresh the list from disk. */
export function useDeleteInstance() {
  const qc = useQueryClient();
  return useMutation<void, Error, Id>({
    mutationFn: (id) => deleteInstance(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.instances });
    },
  });
}

/** Launch the game for an instance (backend logs only for now). */
export function useLaunchInstance() {
  return useMutation<void, Error, Id>({
    mutationFn: (id) => launchInstance(id),
  });
}

interface SetIconVars {
  id: Id;
  srcPath: string;
}

/**
 * Set/replace an instance's icon from a local image path, then refresh that
 * instance and the list (disk is the source of truth — see CLAUDE.md rule 2).
 */
export function useSetInstanceIcon() {
  const qc = useQueryClient();
  return useMutation<Instance, Error, SetIconVars>({
    mutationFn: ({ id, srcPath }) => setInstanceIcon(id, srcPath),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: keys.instance(id) });
      qc.invalidateQueries({ queryKey: keys.instances });
    },
  });
}

/**
 * This machine's physical-RAM snapshot (drives the create dialog's heap
 * slider). Effectively static for a session, so it never refetches on its
 * own — the default staleness is fine and there is no mutation to invalidate.
 */
export function useSystemRam() {
  return useQuery<Ram>({
    queryKey: keys.systemRam,
    queryFn: getSystemRam,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * The Project Zomboid Steam branches for the create dialog's branch select.
 *
 * The backend always returns a non-empty list (it falls back to the static
 * three on any SteamCMD failure/timeout), so this hook resolves fast and
 * never blocks instance creation. Branches change rarely and the one-shot
 * SteamCMD call is comparatively slow, so this is effectively per-session:
 * `staleTime` is infinite (no background refetch).
 */
export function useBranches() {
  return useQuery<BranchInfo[]>({
    queryKey: keys.branches,
    queryFn: listBranches,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** The application settings (read from disk on the backend). */
export function useSettings() {
  return useQuery<Settings>({
    queryKey: keys.settings,
    queryFn: getSettings,
  });
}

/** Apply a partial settings patch, then refresh from disk. */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation<Settings, Error, Patch>({
    mutationFn: (patch) => updateSettings(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

interface ToggleVars {
  workshopId: number;
  enabled: boolean;
}

/** Enable/disable a workshop mod, then refresh that instance's collection. */
export function useToggleMod(instanceId: Id) {
  const qc = useQueryClient();
  return useMutation<void, Error, ToggleVars>({
    mutationFn: ({ workshopId, enabled }) => toggleMod(instanceId, workshopId, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.mods(instanceId) });
    },
  });
}

/** First-run onboarding status (drives the hard gate). */
export function useSetupStatus() {
  return useQuery<SetupStatus>({
    queryKey: keys.setup,
    queryFn: getSetupStatus,
  });
}

/** Auto-detect the PZ install path (read-only; does not persist). */
export function useDetectGamePath() {
  return useMutation<string | null, Error, void>({
    mutationFn: () => detectGamePath(),
  });
}

/** Resolve an already-available SteamCMD path (read-only). */
export function useDetectSteamcmd() {
  return useMutation<string | null, Error, void>({
    mutationFn: () => detectSteamcmd(),
  });
}

/** Validate + persist the PZ path, then refresh setup status and settings. */
export function useSetGamePath() {
  const qc = useQueryClient();
  return useMutation<SetupStatus, Error, string>({
    mutationFn: (path) => setGamePath(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.setup });
      qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

/** Install SteamCMD in-app, then refresh setup status and settings. */
export function useInstallSteamcmd() {
  const qc = useQueryClient();
  return useMutation<string, Error, void>({
    mutationFn: () => installSteamcmd(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.setup });
      qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}

/** Reset all app config to defaults, then refresh setup status + settings. */
export function useResetSetup() {
  const qc = useQueryClient();
  return useMutation<SetupStatus, Error, void>({
    mutationFn: () => resetSetup(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.setup });
      qc.invalidateQueries({ queryKey: keys.settings });
    },
  });
}
