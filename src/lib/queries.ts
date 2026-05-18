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
  getInstance,
  launchInstance,
  listInstances,
  listMods,
  toggleMod,
} from "@/lib/tauri/commands";
import type { Id, Input, Instance } from "@/types/instance";
import type { Collection } from "@/types/mod-collection";

/** Centralized query keys — every hook and invalidation reads from here. */
export const keys = {
  instances: ["instances"] as const,
  instance: (id: Id) => ["instance", id] as const,
  mods: (id: Id) => ["mods", id] as const,
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
