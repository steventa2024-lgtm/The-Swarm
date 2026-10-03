use tauri::Manager;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

mod fs;
mod preview;
mod provider;
mod secrets;

/// Local persistence lives in SQLite (frontend: src/persistence/storage.ts via
/// tauri-plugin-sql). Model-provider traffic goes through `provider.rs` so API
/// keys stay in this process, and project file access through `fs.rs`, which is
/// confined to folders the user approved in a native dialog.
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create_kv_store",
        sql: include_str!("../migrations/001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:zeropulse.db", migrations)
                .build(),
        )
        .manage(provider::Inflight::default())
        .manage(fs::ApprovedRoots::default())
        .setup(|app| {
            let roots = fs::load_approved(app.handle());
            app.state::<fs::ApprovedRoots>().set(roots);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            provider::provider_request,
            provider::provider_stream,
            provider::provider_cancel,
            fs::pick_project_folder,
            fs::is_root_approved,
            fs::fs_list_tree,
            fs::fs_read_text,
            fs::fs_apply,
            secrets::secret_set,
            secrets::secret_status,
            secrets::secret_delete,
            preview::preview_publish,
            preview::preview_clear
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZeroPulse Swarm");
}
