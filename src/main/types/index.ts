// Base message type with discriminator
export interface BaseMessage {
  type: string
}

// Client -> Server Messages
export interface DownloadMessage extends BaseMessage {
  type: "download"
  app_id: number
  workshop_ids: string[]
  destination: string
}

export interface StatusRequestMessage extends BaseMessage {
  type: "status"
}

export interface ServerStatusRequestMessage extends BaseMessage {
  type: "server_status"
}

// Server -> Client Messages
export interface DownloadStartedMessage extends BaseMessage {
  type: "download_started"
  download_id: number
  details: {
    status: "in_progress"
    app_id: number
    workshop_ids: string[]
  }
}
export interface WorkshopItemRequest extends BaseMessage {
  type: "workshop_item"
  workshop_id: string
  is_collection: boolean
}

export interface WorkshopItemResponse extends BaseMessage {
  type: "item_info" | "initial_info"
  item_id: string
  data: {
    id: string
    status: string
    title?: string
    description?: string
    // Add other workshop item fields as needed
  }
}

export interface WorkshopCollectionResponse extends BaseMessage {
  type: "collection_info"
  collection_id: string
  data: {
    id: string
    items: Array<{
      id: string
      title?: string
    }>
  }
}

export interface DownloadCompleteMessage extends BaseMessage {
  type: "download_complete"
  download_id: number
  result: unknown // Replace with specific result type if known
}

export interface ErrorMessage extends BaseMessage {
  type: "error"
  message: string
}

export interface StatusResponseMessage extends BaseMessage {
  type: "status"
  active_downloads: Record<
    number,
    {
      status: "in_progress" | "completed" | "failed"
      app_id: number
      workshop_ids: string[]
      error?: string
    }
  >
  server_status: "ready" | "failed"
}

export interface ServerStatusResponseMessage extends BaseMessage {
  type: "server_status"
  operational: boolean
  message: string
  timestamp: string
}

export type ClientMessage =
  | DownloadMessage
  | StatusRequestMessage
  | ServerStatusRequestMessage
  | WorkshopItemRequest

export type ServerMessage =
  | DownloadStartedMessage
  | DownloadCompleteMessage
  | ErrorMessage
  | StatusResponseMessage
  | ServerStatusResponseMessage
  | WorkshopItemResponse
  | WorkshopCollectionResponse

// WebSocket connection status
export interface WebSocketStatus {
  connected: boolean
}

// WebSocket service events
export interface WebSocketEvents {
  "ws:status": WebSocketStatus
  "ws:message": ServerMessage
  "ws:error": {
    message: string
  }
}

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
  tags?: string[]
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
