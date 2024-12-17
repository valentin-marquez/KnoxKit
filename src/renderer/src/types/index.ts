// Define possible instance statuses
export type InstanceStatus = "ready" | "running" | "stopped" | "error" | "updating"

// Base configuration for creating/updating instances
export interface BaseInstanceConfig {
  name: string
  memory: number
  javaArgs?: string
  iconBase64?: string
  steamCollection?: string | null
  description?: string
  status?: InstanceStatus
  playtime?: number
  lastPlayed?: string
}

// Instance settings with all configuration options
export interface InstanceSettings {
  backup_enabled: boolean
  backup_interval: number
  auto_update: boolean
  custom_launch_options: string
  max_backups: number
  compress_backups: boolean
  auto_restart: boolean
  restart_interval: number
  memory: number
  java_args: string
}

// Complete instance data structure
export interface InstanceData extends BaseInstanceConfig {
  id: string
  created: string
  lastPlayed?: string
  playtime: number
  iconPath: string | null
  steamCollection: string | null
  status: InstanceStatus
  version: string
  settings: InstanceSettings
  lastBackup?: string
  modCount: number
  description: string
  tags: string[]
}
