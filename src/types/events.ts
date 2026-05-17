// keep in sync with src-tauri/src/domain/events.rs

export type Event =
  | { type: "steamcmd_progress"; job_id: string; stage: string; percent: number }
  | { type: "job_failed"; job_id: string; error: string }
  | { type: "instance_created"; id: string };

export type Kind = Event["type"];
