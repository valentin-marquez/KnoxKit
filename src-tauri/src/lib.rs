//! KnoxKit backend library crate (`knoxkit_lib`).
//!
//! keep names path-relative — see docs/conventions.md
//!
//! Strict layering: `domain/` pure types, `commands/` only `#[tauri::command]`
//! fns, `services/` async + IO + logic (never imports `commands/`).

pub mod commands;
pub mod domain;
pub mod error;
pub mod events;
pub mod paths;
pub mod services;
pub mod state;

pub use error::{Error, Result};

use tokio::sync::mpsc;

use crate::services::steamcmd::worker::{ChildProcess, Worker};
use crate::state::State;

/// Build, configure, and run the Tauri application.
///
/// Installs a `tracing` subscriber (the canonical backend logging stack —
/// see docs/conventions.md), registers plugins (`opener`, `dialog`, `shell`),
/// spawns the SteamCMD worker backed by a real Tauri [`Emitter`], manages
/// [`State`], and registers every command on the invoke handler.
pub fn run() {
    // Best-effort tracing init; ignore "already set" in tests/re-entry.
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init();

    // SteamCMD job channel + state. The worker is spawned in `setup` once we
    // have an `AppHandle` for the real event emitter.
    let (job_tx, job_rx) = mpsc::channel(64);
    let job_rx = std::sync::Arc::new(std::sync::Mutex::new(Some(job_rx)));

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(State::new(job_tx))
        .setup(move |app| {
            let handle = app.handle().clone();
            let emitter = crate::events::TauriEmitter::new(handle);

            // steamcmd path resolved lazily from settings at job time; for the
            // bootstrap the process spawn is best-effort.
            let steamcmd_exe =
                std::env::var("KNOXKIT_STEAMCMD").unwrap_or_else(|_| "steamcmd".to_string());

            // SteamCMD writes `workshop_download_item 108600 <id>` content to
            // `<steamcmd dir>/steamapps/workshop/content/108600/<id>/`. Derive
            // that content root from the resolved exe path so the worker can
            // relocate finished downloads into the shared cache.
            let content_root = std::path::Path::new(&steamcmd_exe)
                .parent()
                .unwrap_or_else(|| std::path::Path::new("."))
                .join("steamapps")
                .join("workshop")
                .join("content")
                .join("108600");

            if let Some(rx) = job_rx.lock().ok().and_then(|mut g| g.take()) {
                let process = ChildProcess::new(steamcmd_exe);
                let worker = Worker::new(process, emitter, content_root);
                tauri::async_runtime::spawn(async move {
                    worker.run(rx).await;
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_instances,
            commands::get_instance,
            commands::create_instance,
            commands::delete_instance,
            commands::launch_instance,
            commands::list_mods,
            commands::import_workshop_collection,
            commands::toggle_mod,
            commands::parse_workshop_url,
            commands::get_system_ram,
            commands::get_settings,
            commands::update_settings,
            commands::export_modpack,
            commands::import_modpack,
            commands::validate_modpack,
            commands::get_setup_status,
            commands::detect_game_path,
            commands::set_game_path,
            commands::detect_steamcmd,
            commands::install_steamcmd,
            commands::reset_setup,
        ]);

    if let Err(e) = builder.run(tauri::generate_context!()) {
        tracing::error!("fatal: error while running tauri application: {e}");
        std::process::exit(1);
    }
}
