/**
 * Mock data for the UI shell. No backend wiring yet — these populate the
 * launcher views so the interface feels real. Replace with TanStack Query
 * reading the real commands when wired.
 */

export type Status = "idle" | "running" | "updating";
export type Tag = "modpack" | "custom" | "server";

export interface InstanceCard {
  id: string;
  name: string;
  build: string;
  tag: Tag;
  status: Status;
  hours: number;
  mods: number;
  favorite: boolean;
  lastPlayed: string | null;
}

export interface ModRow {
  id: string;
  name: string;
  author: string;
  version: string;
  enabled: boolean;
  hasUpdate: boolean;
}

export const instances: InstanceCard[] = [
  {
    id: "a1f3-knox-hardcore",
    name: "Hardcore Apocalipsis",
    build: "Build 41.78.16",
    tag: "modpack",
    status: "running",
    hours: 142,
    mods: 38,
    favorite: true,
    lastPlayed: "hace 2 horas",
  },
  {
    id: "b2c4-los-compadres",
    name: "Servidor Los Compadres",
    build: "Build 41.78.16",
    tag: "server",
    status: "idle",
    hours: 87,
    mods: 24,
    favorite: true,
    lastPlayed: "ayer",
  },
  {
    id: "c3d5-sandbox-tranqui",
    name: "Sandbox Tranqui",
    build: "Build 41.78.16",
    tag: "custom",
    status: "idle",
    hours: 31,
    mods: 9,
    favorite: false,
    lastPlayed: "hace 4 días",
  },
  {
    id: "d4e6-knox-county-rp",
    name: "Knox County RP",
    build: "Build 41.78.16",
    tag: "server",
    status: "idle",
    hours: 213,
    mods: 56,
    favorite: false,
    lastPlayed: "hace 1 semana",
  },
  {
    id: "e5f7-build42-test",
    name: "Build 42 — Pruebas",
    build: "Build 42.0.2 (unstable)",
    tag: "custom",
    status: "updating",
    hours: 4,
    mods: 2,
    favorite: false,
    lastPlayed: "hace 12 días",
  },
  {
    id: "f6a8-vanilla-plus",
    name: "Vanilla Plus",
    build: "Build 41.78.16",
    tag: "modpack",
    status: "idle",
    hours: 0,
    mods: 14,
    favorite: false,
    lastPlayed: null,
  },
];

const MODS: ModRow[] = [
  {
    id: "2392709985",
    name: "Brita's Weapon Pack",
    author: "Brita",
    version: "v8.0.3",
    enabled: true,
    hasUpdate: false,
  },
  {
    id: "2516889237",
    name: "Brita's Armor Pack",
    author: "Brita",
    version: "v1.27",
    enabled: true,
    hasUpdate: true,
  },
  {
    id: "2169435993",
    name: "Authentic Z — Current",
    author: "Mr_NoBody",
    version: "v3.4",
    enabled: true,
    hasUpdate: false,
  },
  {
    id: "2200148440",
    name: "Firearms B41",
    author: "vodkarmory",
    version: "v2.1",
    enabled: true,
    hasUpdate: false,
  },
  {
    id: "2282429356",
    name: "Superb Survivors!",
    author: "NoctisFalco",
    version: "v4.0.1",
    enabled: false,
    hasUpdate: false,
  },
  {
    id: "1374479835",
    name: "Filibuster's Rust Vehicles",
    author: "Filibuster",
    version: "v0.9",
    enabled: true,
    hasUpdate: false,
  },
  {
    id: "2459070642",
    name: "Eris Minimap",
    author: "Eris",
    version: "v41.1",
    enabled: true,
    hasUpdate: true,
  },
  {
    id: "2406761305",
    name: "Snake's Traits",
    author: "Snake",
    version: "v3.3",
    enabled: true,
    hasUpdate: false,
  },
  {
    id: "2120111017",
    name: "Common Sense",
    author: "NoirRosaceae",
    version: "v1.6",
    enabled: true,
    hasUpdate: false,
  },
  {
    id: "2648779556",
    name: "True Actions — Dancing",
    author: "Akamods",
    version: "v3.0",
    enabled: false,
    hasUpdate: false,
  },
  {
    id: "2782373443",
    name: "Better Sorting",
    author: "notloc",
    version: "v2.2",
    enabled: true,
    hasUpdate: false,
  },
  {
    id: "2503622437",
    name: "Profession Framework",
    author: "Fenris",
    version: "v1.10",
    enabled: true,
    hasUpdate: false,
  },
];

/** Stable per-instance slice so each detail page looks distinct but consistent. */
export function modsFor(id: string): ModRow[] {
  const seed = [...id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const count = 6 + (seed % (MODS.length - 5));
  return MODS.slice(0, count);
}

export function findInstance(id: string): InstanceCard | undefined {
  return instances.find((i) => i.id === id);
}

export const runningCount = instances.filter((i) => i.status === "running").length;
