//! Command layer: ONLY `#[tauri::command]` fns.
//!
//! keep names path-relative — see docs/conventions.md
//!
//! Command-rename approach: Tauri's `generate_handler!` registers a command by
//! the *Rust fn identifier*, and `#[tauri::command(rename = ...)]` is NOT a
//! supported attribute in Tauri 2.11. To keep the inner module fns
//! path-clean (`commands::instances::list`) while exposing the contract's
//! noun-verb JS names (`list_instances`), the `#[tauri::command]` macro is
//! applied to the thin wrapper fns below. The wrappers are named exactly the
//! registration names and merely forward to the path-clean inner fns. Only the
//! wrappers are registered (see `crate::handler()` in `lib.rs`).

use crate::domain::branch;
use crate::domain::instance::{self, Instance};
use crate::domain::mod_collection::Collection;
use crate::domain::modpack::Manifest;
use crate::domain::settings::{Patch as SettingsPatch, Settings};
use crate::domain::setup::Status as SetupStatus;
use crate::domain::system::Ram;
use crate::domain::workshop::WorkshopRef;
use crate::error::Result;
use crate::state::State;

pub mod branches;
pub mod instances;
pub mod modpack;
pub mod mods;
pub mod settings;
pub mod setup;
pub mod system;
pub mod workshop;

// --- instances ----------------------------------------------------------

/// `list_instances` → `commands::instances::list`.
#[tauri::command]
pub async fn list_instances(_state: tauri::State<'_, State>) -> Result<Vec<Instance>> {
    instances::list().await
}

/// `get_instance` → `commands::instances::get`.
#[tauri::command]
pub async fn get_instance(_state: tauri::State<'_, State>, id: String) -> Result<Instance> {
    instances::get(id).await
}

/// `create_instance` → `commands::instances::create`.
#[tauri::command]
pub async fn create_instance(
    app: tauri::AppHandle,
    _state: tauri::State<'_, State>,
    input: instance::Input,
) -> Result<Instance> {
    instances::create(app, input).await
}

/// `delete_instance` → `commands::instances::delete`.
#[tauri::command]
pub async fn delete_instance(_state: tauri::State<'_, State>, id: String) -> Result<()> {
    instances::delete(id).await
}

/// `launch_instance` → `commands::instances::launch`.
#[tauri::command]
pub async fn launch_instance(_state: tauri::State<'_, State>, id: String) -> Result<()> {
    instances::launch(id).await
}

/// `set_instance_icon` → `commands::instances::set_icon`.
#[tauri::command]
pub async fn set_instance_icon(
    _state: tauri::State<'_, State>,
    id: String,
    src_path: String,
) -> Result<Instance> {
    instances::set_icon(id, src_path).await
}

// --- branches -----------------------------------------------------------

/// `list_branches` → `commands::branches::list`.
#[tauri::command]
pub async fn list_branches(_state: tauri::State<'_, State>) -> Result<Vec<branch::Info>> {
    branches::list().await
}

// --- mods ---------------------------------------------------------------

/// `list_mods` → `commands::mods::list`.
#[tauri::command]
pub async fn list_mods(_state: tauri::State<'_, State>, instance_id: String) -> Result<Collection> {
    mods::list(instance_id).await
}

/// `import_workshop_collection` → `commands::mods::import_collection`.
#[tauri::command]
pub async fn import_workshop_collection(
    state: tauri::State<'_, State>,
    instance_id: String,
    url_or_id: String,
) -> Result<()> {
    let jobs = state.steamcmd.clone();
    mods::import_collection(jobs, instance_id, url_or_id).await
}

/// `toggle_mod` → `commands::mods::toggle`.
#[tauri::command]
pub async fn toggle_mod(
    _state: tauri::State<'_, State>,
    instance_id: String,
    workshop_id: u64,
    enabled: bool,
) -> Result<()> {
    mods::toggle(instance_id, workshop_id, enabled).await
}

// --- workshop -----------------------------------------------------------

/// `parse_workshop_url` → `commands::workshop::parse_url`.
#[tauri::command]
pub async fn parse_workshop_url(
    _state: tauri::State<'_, State>,
    url: String,
) -> Result<WorkshopRef> {
    workshop::parse_url(url).await
}

// --- system -------------------------------------------------------------

/// `get_system_ram` → `commands::system::get`.
#[tauri::command]
pub async fn get_system_ram(_state: tauri::State<'_, State>) -> Result<Ram> {
    system::get().await
}

// --- settings -----------------------------------------------------------

/// `get_settings` → `commands::settings::get`.
#[tauri::command]
pub async fn get_settings(_state: tauri::State<'_, State>) -> Result<Settings> {
    settings::get().await
}

/// `update_settings` → `commands::settings::update`.
#[tauri::command]
pub async fn update_settings(
    _state: tauri::State<'_, State>,
    patch: SettingsPatch,
) -> Result<Settings> {
    settings::update(patch).await
}

// --- modpack ------------------------------------------------------------

/// `export_modpack` → `commands::modpack::export`.
#[tauri::command]
pub async fn export_modpack(
    _state: tauri::State<'_, State>,
    instance_id: String,
    output_path: String,
) -> Result<()> {
    modpack::export(instance_id, output_path).await
}

/// `import_modpack` → `commands::modpack::import`.
#[tauri::command]
pub async fn import_modpack(
    state: tauri::State<'_, State>,
    pack_path: String,
    target_name: String,
) -> Result<String> {
    let jobs = state.steamcmd.clone();
    modpack::import(jobs, pack_path, target_name).await
}

/// `validate_modpack` → `commands::modpack::validate`.
#[tauri::command]
pub async fn validate_modpack(
    _state: tauri::State<'_, State>,
    pack_path: String,
) -> Result<Manifest> {
    modpack::validate(pack_path).await
}

// --- setup / onboarding -------------------------------------------------

/// `get_setup_status` → `commands::setup::status`.
#[tauri::command]
pub async fn get_setup_status(_state: tauri::State<'_, State>) -> Result<SetupStatus> {
    setup::status().await
}

/// `detect_game_path` → `commands::setup::detect_game_path`.
#[tauri::command]
pub async fn detect_game_path(_state: tauri::State<'_, State>) -> Result<Option<String>> {
    setup::detect_game_path().await
}

/// `set_game_path` → `commands::setup::set_game_path`.
#[tauri::command]
pub async fn set_game_path(_state: tauri::State<'_, State>, path: String) -> Result<SetupStatus> {
    setup::set_game_path(path).await
}

/// `detect_steamcmd` → `commands::setup::detect_steamcmd`.
#[tauri::command]
pub async fn detect_steamcmd(_state: tauri::State<'_, State>) -> Result<Option<String>> {
    setup::detect_steamcmd().await
}

/// `install_steamcmd` → `commands::setup::install_steamcmd`.
#[tauri::command]
pub async fn install_steamcmd(_state: tauri::State<'_, State>) -> Result<String> {
    setup::install_steamcmd().await
}

/// `reset_setup` → `commands::setup::reset`.
#[tauri::command]
pub async fn reset_setup(_state: tauri::State<'_, State>) -> Result<SetupStatus> {
    setup::reset().await
}
