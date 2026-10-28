use tauri::Manager;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

mod checks;
mod fs;
mod preview;
mod provider;
mod secrets;
mod cli;
mod approvals;
mod telegram;
mod telegram_bots;

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
        .manage(provider::ApiPolicy::default())
        .manage(fs::ApprovedRoots::default())
        .manage(checks::RunningChecks::default())
        .manage(cli::CliRuns::default())
        .manage(approvals::ApprovalBook::default())
        .manage(telegram::Telegram::default())
        .manage(telegram_bots::TelegramBots::default())
        .setup(|app| {
            let roots = fs::load_approved(app.handle());
            app.state::<fs::ApprovedRoots>().set(roots);
            if telegram_bots::initialize(app.handle()).is_err() { telegram_bots::disable(app.handle()); }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            provider::provider_request,
            provider::set_api_policy,
            provider::provider_stream,
            provider::provider_cancel,
            fs::pick_project_folder,
            fs::is_root_approved,
            fs::fs_list_tree,
            fs::fs_read_text,
            approvals::fs_stage,
            approvals::fs_get_staged,
            approvals::fs_apply,
            cli::cli_chat,
            cli::cli_cancel,
            telegram::telegram_status,
            telegram::telegram_start,
            telegram::telegram_stop,
            telegram::telegram_request_approval,
            telegram::telegram_voice,
            telegram::telegram_send_voice,
            telegram_bots::tg_dashboard,
            telegram_bots::tg_save_bot,
            telegram_bots::tg_set_token,
            telegram_bots::tg_remove_token,
            telegram_bots::tg_test_bot,
            telegram_bots::tg_start_bot,
            telegram_bots::tg_stop_bot,
            telegram_bots::tg_delete_webhook,
            telegram_bots::tg_send_test,
            telegram_bots::tg_begin_pairing,
            telegram_bots::tg_confirm_pairing,
            telegram_bots::tg_save_settings,
            telegram_bots::tg_publish_event,
            telegram_bots::tg_sync_workspace,
            telegram_bots::tg_request_approval,
            telegram_bots::tg_command_result,
            telegram_bots::tg_approval_probe,
            secrets::secret_set,
            secrets::secret_status,
            secrets::secret_delete,
            preview::preview_publish,
            preview::preview_clear,
            checks::detect_checks,
            checks::run_check,
            checks::cancel_check
        ])
        .build(tauri::generate_context!())
        .expect("error while building ZeroPulse Swarm")
        .run(|app, event| { if matches!(event, tauri::RunEvent::Exit) { telegram_bots::shutdown(app); } });
}
