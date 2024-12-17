export enum SetupStatus {
  PENDING = "pending",
  DOWNLOADING = "downloading",
  EXTRACTING = "extracting",
  INITIALIZING = "initializing",
  COMPLETED = "completed",
  FAILED = "failed"
}

export interface SetupState {
  status: SetupStatus
  progress: number
  error?: string
}

export interface WSMessage {
  type: string
  status?: string
  progress?: number
  error?: string
  setup_status?: string
  setup_progress?: number
}
