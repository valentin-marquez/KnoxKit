//! Instance commands: thin arg-parse → service → DTO. No logic here.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `commands::instances::list`, etc. The `#[tauri::command]`
//! attribute + noun-verb registration names live on the thin wrappers in
//! `commands/mod.rs`; these path-clean fns hold the (trivial) glue.

use crate::domain::instance::{self, Instance};
use crate::error::Result;
use crate::events;
use crate::services::instances::{disk, launch};

/// List every instance. (registered via `commands::list_instances`)
pub async fn list() -> Result<Vec<Instance>> {
    disk::list()
}

/// Read one instance by id. (registered via `commands::get_instance`)
pub async fn get(id: String) -> Result<Instance> {
    disk::read(&id)
}

/// Create an instance and emit `InstanceCreated`.
/// (registered via `commands::create_instance`)
pub async fn create(app: tauri::AppHandle, input: instance::Input) -> Result<Instance> {
    let inst = disk::create(input)?;
    {
        use crate::events::Emitter as _;
        events::TauriEmitter::new(app).emit(events::Event::InstanceCreated {
            id: inst.id.clone(),
        });
    }
    Ok(inst)
}

/// Delete an instance by id. (registered via `commands::delete_instance`)
pub async fn delete(id: String) -> Result<()> {
    disk::delete(&id)
}

/// Launch an instance. (registered via `commands::launch_instance`)
pub async fn launch(id: String) -> Result<()> {
    tracing::info!("launching instance {id}");
    launch::run(&id)
}
