//! Local multi-bot Telegram transport. No token is serialized, returned to the
//! webview, logged, or accepted from the environment. Telegram is a projection of
//! actual Swarm events, never an independent agent conversation loop.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs::{File, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

const IDS: &[&str] = &[
    "hq", "codex", "claude", "gemini", "cursor", "grok", "ollama",
];
const STYLES: &[&str] = &[
    "professional",
    "strategic",
    "collaborative",
    "creative",
    "meticulous",
    "witty",
    "practical",
];
const ROLES: &[&str] = &[
    "hq",
    "planner",
    "backend",
    "frontend",
    "qa",
    "researcher",
    "docs",
    "reviewer",
];
const KINDS: &[&str] = &[
    "task_started",
    "agent_assigned",
    "task_finished",
    "task_failed",
    "project_attention",
    "workflow_finished",
    "critical_alert",
];
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn key(id: &str) -> Result<String, String> {
    if !IDS.contains(&id) {
        return Err("Unknown Telegram bot slot".into());
    }
    Ok(format!("TELEGRAM_BOT_{}_TOKEN", id.to_uppercase()))
}
fn token(id: &str) -> Result<String, String> {
    crate::secrets::credential_only(&key(id)?)
        .ok_or("Save this bot's token in Windows Credential Manager first".into())
}
fn valid_ref(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 96
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
fn expected(id: &str) -> &'static str {
    match id {
        "hq" => "ZeroPulseSwarmHQBot",
        "codex" => "ZPSwarmCodexBot",
        "claude" => "ZPSwarmClaudeBot",
        "gemini" => "ZPSwarmGeminiBot",
        "cursor" => "ZPSwarmCursorBot",
        "grok" => "ZPSwarmGrokBot",
        _ => "",
    }
}
fn username(s: &str) -> bool {
    (5..=64).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Permissions {
    pub notifications: bool,
    pub commands: bool,
    pub approvals: bool,
    pub test_messages: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BotConfig {
    pub id: String,
    pub name: String,
    pub role: String,
    pub expected_username: String,
    pub permissions: Permissions,
    pub style: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BotRecord {
    #[serde(flatten)]
    config: BotConfig,
    actual_username: Option<String>,
    bot_id: Option<i64>,
    last_activity: Option<u64>,
    offset: i64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub personalities: bool,
    pub notifications: bool,
    pub critical_alerts: bool,
    pub min_interval_secs: u64,
    pub quiet_start: Option<u8>,
    pub quiet_end: Option<u8>,
    pub reminders: bool,
    pub reminder_delay_secs: u64,
    pub max_reminders: u8,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            personalities: false,
            notifications: true,
            critical_alerts: true,
            min_interval_secs: 10,
            quiet_start: None,
            quiet_end: None,
            reminders: false,
            reminder_delay_secs: 900,
            max_reminders: 1,
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Delivery {
    pub id: String,
    pub bot_id: String,
    pub kind: String,
    pub status: String,
    pub at: u64,
    pub reference: String,
    pub error: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Persisted {
    version: u8,
    bots: Vec<BotRecord>,
    owner_id: Option<i64>,
    private_chat_id: Option<i64>,
    group_chat_id: Option<i64>,
    settings: Settings,
    deliveries: Vec<Delivery>,
    dedup: Vec<String>,
    #[serde(default)]
    queue: Vec<QueuedEvent>,
}
impl Default for Persisted {
    fn default() -> Self {
        let names = [
            "Swarm Headquarters",
            "Codex · Chief Engineer",
            "Claude · Principal Engineer",
            "Gemini · UI Engineer",
            "Cursor · QA",
            "Grok · Research",
            "Ollama · Future offline bot",
        ];
        let roles = [
            "hq",
            "planner",
            "backend",
            "frontend",
            "qa",
            "researcher",
            "docs",
        ];
        Self {
            version: 1,
            bots: IDS
                .iter()
                .enumerate()
                .map(|(i, id)| BotRecord {
                    config: BotConfig {
                        id: id.to_string(),
                        name: names[i].into(),
                        role: roles[i].into(),
                        expected_username: expected(id).into(),
                        style: STYLES[i].into(),
                        permissions: Permissions {
                            notifications: true,
                            commands: true,
                            approvals: *id == "hq",
                            test_messages: true,
                        },
                    },
                    actual_username: None,
                    bot_id: None,
                    last_activity: None,
                    offset: 0,
                })
                .collect(),
            owner_id: None,
            private_chat_id: None,
            group_chat_id: None,
            settings: Settings::default(),
            deliveries: vec![],
            dedup: vec![],
            queue: vec![],
        }
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pairing {
    pub kind: String,
    pub code: String,
    pub expires_at: u64,
    pub candidate_user_id: Option<i64>,
    pub candidate_chat_id: Option<i64>,
}
struct Receiver {
    cancel: Arc<AtomicBool>,
    generation: String,
}
#[derive(Default)]
struct Runtime {
    status: String,
    error: Option<String>,
    verified: bool,
}
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub projects: Vec<Reference>,
    pub agents: Vec<Reference>,
    pub tasks: Vec<TaskRef>,
    pub active_run_id: Option<String>,
    pub active_status: Option<String>,
}
#[derive(Clone, Deserialize)]
pub struct Reference {
    pub id: String,
    pub status: String,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRef {
    pub id: String,
    pub run_id: String,
    pub project_id: String,
    pub status: String,
}
struct PendingCommand {
    bot_id: String,
    chat_id: i64,
    run_id: String,
    expires: u64,
}
struct Inner {
    persisted: Persisted,
    runtime: HashMap<String, Runtime>,
    receivers: HashMap<String, Receiver>,
    pairing: Option<Pairing>,
    workspace: Workspace,
    synced_at: u64,
    commands: HashMap<String, PendingCommand>,
    last_send: HashMap<String, u64>,
    reminders: HashMap<String, (u64, u8)>,
    dispatcher_stop: Arc<AtomicBool>,
    manager_lease: Option<File>,
}
impl Default for Inner {
    fn default() -> Self {
        Self {
            persisted: Persisted::default(),
            runtime: HashMap::new(),
            receivers: HashMap::new(),
            pairing: None,
            workspace: Workspace::default(),
            synced_at: 0,
            commands: HashMap::new(),
            last_send: HashMap::new(),
            reminders: HashMap::new(),
            dispatcher_stop: Arc::new(AtomicBool::new(false)),
            manager_lease: None,
        }
    }
}
#[derive(Default)]
pub struct TelegramBots(Mutex<Inner>);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BotView {
    #[serde(flatten)]
    config: BotConfig,
    pub actual_username: Option<String>,
    pub bot_id: Option<i64>,
    pub token_present: bool,
    pub status: String,
    pub last_activity: Option<u64>,
    pub error: Option<String>,
    pub transport: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub bots: Vec<BotView>,
    pub settings: Settings,
    pub pairing: Option<Pairing>,
    pub owner_id: Option<i64>,
    pub private_chat_id: Option<i64>,
    pub group_chat_id: Option<i64>,
    pub deliveries: Vec<Delivery>,
    pub pending_approvals: Vec<crate::approvals::ApprovalInfo>,
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "App data unavailable")?;
    std::fs::create_dir_all(&dir).map_err(|_| "Cannot create Telegram configuration directory")?;
    Ok(dir.join("telegram-bots-v1.json"))
}
fn persist(app: &AppHandle, p: &Persisted) -> Result<(), String> {
    let target = path(app)?;
    let temp = target.with_extension("tmp");
    let bytes = serde_json::to_vec(p).map_err(|_| "Cannot encode Telegram settings")?;
    let mut file = File::create(&temp).map_err(|_| "Cannot save Telegram settings")?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Cannot commit Telegram settings")?;
    std::fs::rename(temp, target).map_err(|_| "Cannot replace Telegram settings".into())
}
pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let target = path(app)?;
    let manager = lease_file(target.with_file_name("telegram-manager.lock")).map_err(|_| {
        "Another Swarm instance owns Telegram configuration. Close it before connecting bots here."
    })?;
    app.state::<TelegramBots>().0.lock().unwrap().manager_lease = Some(manager);
    if target.is_file() {
        let bytes = std::fs::read(target).map_err(|_| "Cannot read Telegram settings")?;
        let saved: Persisted = serde_json::from_slice(&bytes)
            .map_err(|_| "Telegram settings are damaged; restore a backup before connecting")?;
        let ids: HashSet<_> = saved.bots.iter().map(|b| b.config.id.as_str()).collect();
        if saved.version != 1
            || ids.len() != 7
            || IDS.iter().any(|id| !ids.contains(id))
            || saved.bots.len() != 7
            || saved
                .bots
                .iter()
                .any(|b| validate_config(&b.config).is_err() || b.offset < 0)
            || saved.queue.len() > 200
            || saved.deliveries.len() > 100
            || saved.dedup.len() > 1000
            || saved.owner_id.is_some() != saved.private_chat_id.is_some()
            || saved.owner_id.is_some_and(|id| id <= 0)
            || saved.private_chat_id.is_some_and(|id| id <= 0)
            || saved.group_chat_id.is_some_and(|id| id >= 0)
        {
            return Err("Unsupported Telegram settings".into());
        }
        let mut saved = saved;
        for d in &mut saved.deliveries {
            if d.status == "queued"
                && !saved
                    .queue
                    .iter()
                    .any(|q| q.bot_id == d.bot_id && q.event.id == d.reference)
            {
                d.status = "failed".into();
                d.error=Some("Desktop restarted before delivery was confirmed; this message was not replayed".into());
            }
        }
        app.state::<TelegramBots>().0.lock().unwrap().persisted = saved;
    }
    let cancel = app
        .state::<TelegramBots>()
        .0
        .lock()
        .unwrap()
        .dispatcher_stop
        .clone();
    let app = app.clone();
    std::thread::spawn(move || {
        while !cancel.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_secs(1));
            if cancel.load(Ordering::SeqCst) {
                break;
            }
            tauri::async_runtime::block_on(async {
                let _ = flush_queue(&app).await;
                let _ = remind(&app).await;
            });
        }
    });
    Ok(())
}
pub fn shutdown(app: &AppHandle) {
    let state = app.state::<TelegramBots>();
    let inner = state.0.lock().unwrap();
    inner.dispatcher_stop.store(true, Ordering::SeqCst);
    for receiver in inner.receivers.values() {
        receiver.cancel.store(true, Ordering::SeqCst);
    }
}
/// Setup errors disable Telegram without preventing the engineering workspace
/// from opening. Called only before receivers or the dispatcher are started.
pub fn disable(app: &AppHandle) {
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    inner.dispatcher_stop.store(true, Ordering::SeqCst);
    inner.manager_lease = None;
}
fn ready(app: &AppHandle) -> Result<(), String> {
    if app
        .state::<TelegramBots>()
        .0
        .lock()
        .unwrap()
        .manager_lease
        .is_none()
    {
        Err("Another Swarm instance owns Telegram configuration, or local storage is unavailable. Close the other instance and restart this app before connecting bots.".into())
    } else {
        Ok(())
    }
}
fn validate_config(config: &BotConfig) -> Result<(), String> {
    key(&config.id)?;
    if config.name.trim().is_empty()
        || config.name.len() > 80
        || !ROLES.contains(&config.role.as_str())
        || !STYLES.contains(&config.style.as_str())
    {
        return Err("Use a name under 80 characters and a supported role/style".into());
    }
    if ["hq", "codex", "claude", "gemini"].contains(&config.id.as_str())
        && config.expected_username != expected(&config.id)
    {
        return Err("This bot slot requires its registered expected username".into());
    }
    if !config.expected_username.is_empty()
        && !username(config.expected_username.trim_start_matches('@'))
    {
        return Err("Invalid expected Telegram username".into());
    }
    if config.id != "hq" && config.permissions.approvals {
        return Err("Only HQ may carry approval controls".into());
    }
    Ok(())
}
fn quiet(settings: &Settings, at: u64) -> bool {
    match (settings.quiet_start, settings.quiet_end) {
        (Some(start), Some(end)) if start != end => {
            let hour = ((at / 3600) % 24) as u8;
            if start < end {
                hour >= start && hour < end
            } else {
                hour >= start || hour < end
            }
        }
        _ => false,
    }
}
fn api_error(code: u16, retry_after: Option<u64>) -> String {
    match code { 401 | 404 => "Telegram authentication failed. Replace the bot token and test again.".into(), 403 => "Telegram denied access. Start the bot privately or add it to the selected group with send permission.".into(), 409 => "Telegram delivery conflict: another poller or webhook is using this bot. Stop that receiver before reconnecting.".into(), 429 => format!("Telegram rate limit. Retry after {} seconds.", retry_after.unwrap_or(30).min(3600)), _ => format!("Telegram request failed (HTTP {code}).") }
}
async fn api_with_token(
    secret: &str,
    method: &str,
    body: Value,
    poll: bool,
) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(if poll { 30 } else { 20 }))
        .build()
        .map_err(|_| "Telegram client unavailable")?;
    let response = client
        .post(format!("https://api.telegram.org/bot{secret}/{method}"))
        .json(&body)
        .send()
        .await
        .map_err(|_| {
            "Telegram is offline or unreachable. The receiver will reconnect with bounded backoff."
        })?;
    let status = response.status().as_u16();
    let value: Value = response
        .json()
        .await
        .map_err(|_| "Telegram returned an invalid response")?;
    if status >= 400 || value["ok"] != true {
        return Err(api_error(
            value["error_code"].as_u64().unwrap_or(status as u64) as u16,
            value["parameters"]["retry_after"].as_u64(),
        ));
    }
    Ok(value["result"].clone())
}
async fn api(id: &str, method: &str, body: Value) -> Result<Value, String> {
    api_with_token(&token(id)?, method, body, false).await
}
async fn verified_api(
    app: &AppHandle,
    id: &str,
    method: &str,
    body: Value,
) -> Result<Value, String> {
    let secret = {
        let state = app.state::<TelegramBots>();
        let inner = state.0.lock().unwrap();
        if !inner.runtime.get(id).is_some_and(|r| r.verified) {
            return Err("Bot credentials are not currently verified; test the current token before messaging".into());
        }
        token(id)?
    };
    // Capture under the same lock used by replacement: an in-flight send always
    // belongs to the exact identity that passed getMe, never its replacement.
    api_with_token(&secret, method, body, false).await
}
fn identity(value: &Value, wanted: &str) -> Result<(i64, String), String> {
    let id = value["id"]
        .as_i64()
        .filter(|id| *id > 0)
        .ok_or("Telegram getMe returned no numeric bot identity")?;
    let actual = value["username"]
        .as_str()
        .filter(|s| username(s))
        .ok_or("Telegram getMe returned no valid username")?;
    if value["is_bot"] != true {
        return Err("The credential does not identify a Telegram bot".into());
    }
    if !wanted.is_empty() && !actual.eq_ignore_ascii_case(wanted.trim_start_matches('@')) {
        return Err(format!("Identity mismatch: expected @{wanted}, getMe returned @{actual}. Token rejected for this slot."));
    }
    Ok((id, actual.into()))
}
fn changed(app: &AppHandle) {
    let _ = app.emit("tg-updated", ());
}
fn error(app: &AppHandle, id: &str, message: &str) {
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    let runtime = inner.runtime.entry(id.into()).or_default();
    runtime.status = if message.contains("offline") {
        "offline"
    } else {
        "error"
    }
    .into();
    runtime.error = Some(message.into());
    if message.contains("authentication") || message.contains("Identity mismatch") {
        runtime.verified = false;
    }
    drop(inner);
    changed(app);
}
fn stop(inner: &mut Inner, id: &str) {
    if let Some(receiver) = inner.receivers.get(id) {
        receiver.cancel.store(true, Ordering::SeqCst);
    }
    let runtime = inner.runtime.entry(id.into()).or_default();
    runtime.status = "offline".into();
}
fn invalidate(inner: &mut Inner, id: &str) {
    stop(inner, id);
    inner.persisted.queue.retain(|q| q.bot_id != id);
    inner.runtime.entry(id.into()).or_default().verified = false;
    if let Some(bot) = inner.persisted.bots.iter_mut().find(|b| b.config.id == id) {
        bot.actual_username = None;
        bot.bot_id = None;
        bot.offset = 0;
    }
}

#[tauri::command]
pub fn tg_dashboard(app: AppHandle) -> Dashboard {
    let state = app.state::<TelegramBots>();
    let inner = state.0.lock().unwrap();
    let bots = inner.persisted.bots.iter().map(|b| {
        let present = token(&b.config.id).is_ok(); let rt = inner.runtime.get(&b.config.id);
        let listening = inner.receivers.get(&b.config.id).is_some_and(|r| !r.cancel.load(Ordering::SeqCst));
        let unavailable=inner.manager_lease.is_none();let status = if unavailable{"error"}else if !present { "not_configured" } else if let Some(rt) = rt { if rt.status.is_empty() { "credentials_saved" } else { &rt.status } } else { "credentials_saved" };
        BotView { config: b.config.clone(), actual_username: b.actual_username.clone(), bot_id: b.bot_id, token_present: present, status: status.into(), last_activity: b.last_activity, error: if unavailable{Some("Telegram is owned by another Swarm instance or local storage is unavailable. Close the other instance and restart this app.".into())}else{rt.and_then(|r| r.error.clone())}, transport: if listening { "polling" } else { "stopped" }.into() }
    }).collect();
    Dashboard {
        bots,
        settings: inner.persisted.settings.clone(),
        pairing: inner.pairing.clone().filter(|p| p.expires_at > now()),
        owner_id: inner.persisted.owner_id,
        private_chat_id: inner.persisted.private_chat_id,
        group_chat_id: inner.persisted.group_chat_id,
        deliveries: inner.persisted.deliveries.clone(),
        pending_approvals: app.state::<crate::approvals::ApprovalBook>().pending(),
    }
}
#[tauri::command]
pub fn tg_save_bot(app: AppHandle, mut bot: BotConfig) -> Result<(), String> {
    ready(&app)?;
    bot.expected_username = bot.expected_username.trim_start_matches('@').into();
    validate_config(&bot)?;
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    let old = inner
        .persisted
        .bots
        .iter()
        .find(|b| b.config.id == bot.id)
        .ok_or("Unknown bot")?;
    if old.config.expected_username != bot.expected_username {
        invalidate(&mut inner, &bot.id);
    }
    let id = bot.id.clone();
    inner
        .persisted
        .bots
        .iter_mut()
        .find(|b| b.config.id == id)
        .unwrap()
        .config = bot;
    persist(&app, &inner.persisted)?;
    drop(inner);
    changed(&app);
    Ok(())
}
#[tauri::command]
pub fn tg_set_token(app: AppHandle, bot_id: String, value: String) -> Result<(), String> {
    ready(&app)?;
    let name = key(&bot_id)?;
    let value = value.trim();
    let (prefix, suffix) = value
        .split_once(':')
        .ok_or("That is not a Telegram bot token")?;
    if prefix.is_empty()
        || prefix.len() > 20
        || !prefix.bytes().all(|b| b.is_ascii_digit())
        || suffix.len() < 20
        || suffix.len() > 160
        || !suffix
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("That is not a Telegram bot token".into());
    }
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    invalidate(&mut inner, &bot_id);
    crate::secrets::store_managed(&name, value)?;
    inner.runtime.entry(bot_id).or_default().status = "credentials_saved".into();
    persist(&app, &inner.persisted)?;
    drop(inner);
    changed(&app);
    Ok(())
}
#[tauri::command]
pub fn tg_remove_token(app: AppHandle, bot_id: String) -> Result<(), String> {
    ready(&app)?;
    let name = key(&bot_id)?;
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    invalidate(&mut inner, &bot_id);
    crate::secrets::remove_managed(&name)?;
    inner.runtime.entry(bot_id).or_default().status = "not_configured".into();
    persist(&app, &inner.persisted)?;
    drop(inner);
    changed(&app);
    Ok(())
}
#[tauri::command]
pub async fn tg_test_bot(app: AppHandle, bot_id: String) -> Result<(), String> {
    ready(&app)?;
    let wanted = {
        let state = app.state::<TelegramBots>();
        let mut inner = state.0.lock().unwrap();
        let expected = inner
            .persisted
            .bots
            .iter()
            .find(|b| b.config.id == bot_id)
            .ok_or("Unknown bot")?
            .config
            .expected_username
            .clone();
        inner.runtime.entry(bot_id.clone()).or_default().verified = false;
        expected
    };
    let secret = token(&bot_id)?;
    let result = api_with_token(&secret, "getMe", json!({}), false).await;
    let value = match result {
        Ok(v) => v,
        Err(e) => {
            error(&app, &bot_id, &e);
            return Err(e);
        }
    };
    let provisional = ["cursor", "grok", "ollama"].contains(&bot_id.as_str());
    let verified = identity(&value, if provisional { "" } else { &wanted });
    let (numeric, actual) = match verified {
        Ok(v) => v,
        Err(e) => {
            error(&app, &bot_id, &e);
            return Err(e);
        }
    };
    if provisional && !actual.eq_ignore_ascii_case(&wanted) && !app.dialog().message(format!("Telegram returned @{actual} (bot ID {numeric}) for the {bot_id} slot. Confirm this is your intended bot identity? The expected username will be updated.")).title("Confirm provisional Telegram identity").buttons(MessageDialogButtons::OkCancel).blocking_show() { return Err("Provisional bot identity was not confirmed".into()) }
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    if token(&bot_id).as_deref() != Ok(secret.as_str())
        || inner
            .persisted
            .bots
            .iter()
            .find(|b| b.config.id == bot_id)
            .is_none_or(|b| b.config.expected_username != wanted)
    {
        return Err("Credential or expected identity changed during testing; test the current credential again".into());
    }
    if inner
        .persisted
        .bots
        .iter()
        .any(|b| b.config.id != bot_id && b.bot_id == Some(numeric))
    {
        return Err("This bot identity is already assigned to another slot".into());
    }
    let bot = inner
        .persisted
        .bots
        .iter_mut()
        .find(|b| b.config.id == bot_id)
        .unwrap();
    bot.actual_username = Some(actual.clone());
    bot.bot_id = Some(numeric);
    bot.last_activity = Some(now());
    if provisional {
        bot.config.expected_username = actual;
    }
    let listening = inner
        .receivers
        .get(&bot_id)
        .is_some_and(|r| !r.cancel.load(Ordering::SeqCst));
    let rt = inner.runtime.entry(bot_id).or_default();
    rt.verified = true;
    rt.status = if listening { "listening" } else { "verified" }.into();
    rt.error = None;
    persist(&app, &inner.persisted)?;
    drop(inner);
    changed(&app);
    Ok(())
}
pub fn ensure_legacy_available(app: &AppHandle, legacy_token: &str) -> Result<(), String> {
    ready(app)?;
    let state = app.state::<TelegramBots>();
    let inner = state.0.lock().unwrap();
    if inner.receivers.iter().any(|(id, r)| {
        !r.cancel.load(Ordering::SeqCst) && token(id).is_ok_and(|t| t == legacy_token)
    }) {
        return Err("This token already has a Telegram Bots poller. Stop it before registering a legacy webhook.".into());
    }
    Ok(())
}
fn receiver_current(inner: &Inner, id: &str, generation: &str) -> bool {
    inner
        .receivers
        .get(id)
        .is_some_and(|r| r.generation == generation && !r.cancel.load(Ordering::SeqCst))
}
fn current(app: &AppHandle, id: &str, generation: &str) -> bool {
    receiver_current(
        &app.state::<TelegramBots>().0.lock().unwrap(),
        id,
        generation,
    )
}
fn lease_file(p: PathBuf) -> Result<File, String> {
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(p)
        .map_err(|_| "Cannot create Telegram receiver lock")?;
    file.try_lock()
        .map_err(|_| "Another Swarm instance is already receiving updates for this bot")?;
    Ok(file)
}
fn lease(app: &AppHandle, numeric: i64) -> Result<File, String> {
    lease_file(path(app)?.with_file_name(format!("telegram-receiver-{numeric}.lock")))
}
#[tauri::command]
pub async fn tg_start_bot(app: AppHandle, bot_id: String) -> Result<(), String> {
    ready(&app)?;
    key(&bot_id)?;
    {
        let state = app.state::<TelegramBots>();
        let inner = state.0.lock().unwrap();
        if inner
            .receivers
            .get(&bot_id)
            .is_some_and(|r| !r.cancel.load(Ordering::SeqCst))
        {
            return Err("This bot already has an active poller".into());
        }
    }
    tg_test_bot(app.clone(), bot_id.clone()).await?;
    let hook = api(&bot_id, "getWebhookInfo", json!({})).await?;
    if let Err(msg) = polling_allowed(&hook) {
        error(&app, &bot_id, &msg);
        return Err(msg);
    }
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    if inner
        .receivers
        .get(&bot_id)
        .is_some_and(|r| !r.cancel.load(Ordering::SeqCst))
    {
        return Err("This bot already has an active poller".into());
    }
    let numeric = inner
        .persisted
        .bots
        .iter()
        .find(|b| b.config.id == bot_id)
        .and_then(|b| b.bot_id)
        .ok_or("Test this bot first")?;
    let guard = lease(&app, numeric)?;
    let cancel = Arc::new(AtomicBool::new(false));
    let generation = uuid::Uuid::new_v4().to_string();
    inner.receivers.insert(
        bot_id.clone(),
        Receiver {
            cancel: cancel.clone(),
            generation: generation.clone(),
        },
    );
    let rt = inner.runtime.entry(bot_id.clone()).or_default();
    rt.status = "listening".into();
    rt.error = None;
    drop(inner);
    changed(&app);
    std::thread::spawn(move || {
        let _lease = guard;
        tauri::async_runtime::block_on(poll(app, bot_id, generation, cancel));
    });
    Ok(())
}
#[tauri::command]
pub fn tg_stop_bot(app: AppHandle, bot_id: String) -> Result<(), String> {
    ready(&app)?;
    key(&bot_id)?;
    let state = app.state::<TelegramBots>();
    stop(&mut state.0.lock().unwrap(), &bot_id);
    changed(&app);
    Ok(())
}
fn polling_allowed(hook: &Value) -> Result<(), String> {
    match hook["url"].as_str(){Some("")=>Ok(()),Some(_)=>Err("A webhook is registered for this bot. Disconnect its webhook first; polling and webhooks cannot run together.".into()),None=>Err("Telegram webhook status could not be validated. Polling was not started.".into())}
}
#[tauri::command]
pub async fn tg_delete_webhook(app: AppHandle, bot_id: String) -> Result<(), String> {
    key(&bot_id)?;
    {
        let state = app.state::<TelegramBots>();
        let inner = state.0.lock().unwrap();
        if inner
            .receivers
            .get(&bot_id)
            .is_some_and(|r| !r.cancel.load(Ordering::SeqCst))
        {
            return Err("Stop the local receiver before changing its webhook".into());
        }
    }
    tg_test_bot(app.clone(), bot_id.clone()).await?;
    let (numeric, secret) = {
        let state = app.state::<TelegramBots>();
        let inner = state.0.lock().unwrap();
        let numeric = inner
            .persisted
            .bots
            .iter()
            .find(|b| b.config.id == bot_id)
            .and_then(|b| b.bot_id)
            .ok_or("Verify this bot first")?;
        (numeric, token(&bot_id)?)
    };
    if !app.dialog().message(format!("Zero, remove the existing Telegram webhook for {bot_id} (bot ID {numeric}) so local polling can be used? This can disconnect another installation. Pending updates will be retained.")).title("Switch Telegram delivery method").buttons(MessageDialogButtons::OkCancel).blocking_show(){return Err("Webhook change cancelled".into())}
    {
        let state = app.state::<TelegramBots>();
        let inner = state.0.lock().unwrap();
        if token(&bot_id).as_deref() != Ok(secret.as_str())
            || !inner.runtime.get(&bot_id).is_some_and(|r| r.verified)
            || inner
                .persisted
                .bots
                .iter()
                .find(|b| b.config.id == bot_id)
                .and_then(|b| b.bot_id)
                != Some(numeric)
        {
            return Err("Bot credential or identity changed during confirmation. Test the current bot and try again.".into());
        }
    }
    api_with_token(
        &secret,
        "deleteWebhook",
        json!({"drop_pending_updates":false}),
        false,
    )
    .await?;
    changed(&app);
    Ok(())
}
fn backoff(attempt: u32) -> u64 {
    (2u64.saturating_pow(attempt.min(6))).min(60)
}
fn commit_offset(
    p: &mut Persisted,
    id: &str,
    number: i64,
    save: impl FnOnce(&Persisted) -> Result<(), String>,
) -> Result<bool, String> {
    let bot = p
        .bots
        .iter_mut()
        .find(|b| b.config.id == id)
        .ok_or("Unknown Telegram bot")?;
    if number < bot.offset {
        return Ok(false);
    }
    let old = (bot.offset, bot.last_activity);
    bot.offset = number.saturating_add(1);
    bot.last_activity = Some(now());
    if let Err(e) = save(p) {
        let bot = p.bots.iter_mut().find(|b| b.config.id == id).unwrap();
        bot.offset = old.0;
        bot.last_activity = old.1;
        return Err(e);
    }
    Ok(true)
}
async fn poll(app: AppHandle, id: String, generation: String, cancel: Arc<AtomicBool>) {
    let mut attempts = 0;
    while !cancel.load(Ordering::SeqCst) {
        let offset = {
            let state = app.state::<TelegramBots>();
            let inner = state.0.lock().unwrap();
            inner
                .persisted
                .bots
                .iter()
                .find(|b| b.config.id == id)
                .map(|b| b.offset)
                .unwrap_or(0)
        };
        let result=match token(&id) { Ok(secret)=>api_with_token(&secret,"getUpdates",json!({"offset":offset,"timeout":20,"limit":50,"allowed_updates":["message","callback_query"]}),true).await,Err(e)=>Err(e) };
        if !current(&app, &id, &generation) {
            break;
        }
        match result {
            Ok(updates) => {
                attempts = 0;
                {
                    let state = app.state::<TelegramBots>();
                    let mut inner = state.0.lock().unwrap();
                    let rt = inner.runtime.entry(id.clone()).or_default();
                    rt.status = "listening".into();
                    rt.error = None;
                }
                if let Some(updates) = updates.as_array() {
                    for update in updates {
                        if !current(&app, &id, &generation) {
                            break;
                        }
                        let Some(number) = update["update_id"].as_i64().filter(|n| *n >= 0) else {
                            continue;
                        };
                        // Commit the offset before dispatch: a crash cannot replay an owner action.
                        let committed = {
                            let state = app.state::<TelegramBots>();
                            let mut inner = state.0.lock().unwrap();
                            commit_offset(&mut inner.persisted, &id, number, |p| persist(&app, p))
                        };
                        match committed {
                            Ok(true) => {
                                if let Err(e) = handle_update(&app, &id, &generation, update).await
                                {
                                    error(&app, &id, &e);
                                }
                            }
                            Ok(false) => {}
                            Err(_) => {
                                cancel.store(true, Ordering::SeqCst);
                                error(&app,&id,"Cannot commit Telegram polling offset. Receiver stopped without acknowledging the update.");
                                break;
                            }
                        }
                    }
                }
            }
            Err(e) => {
                error(&app, &id, &e);
                if e.contains("authentication") || e.contains("delivery conflict") {
                    break;
                }
                attempts += 1;
                let delay = retry_delay(&e, attempts);
                for _ in 0..delay * 10 {
                    if cancel.load(Ordering::SeqCst) {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
        }
    }
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    if inner
        .receivers
        .get(&id)
        .is_some_and(|r| r.generation == generation)
    {
        inner.receivers.remove(&id);
        let rt = inner.runtime.entry(id).or_default();
        if rt.status == "listening" {
            rt.status = "offline".into();
        }
    }
    drop(inner);
    changed(&app);
}

#[tauri::command]
pub fn tg_begin_pairing(app: AppHandle, kind: String) -> Result<Pairing, String> {
    ready(&app)?;
    if !["owner", "group"].contains(&kind.as_str()) {
        return Err("Pair owner or group".into());
    }
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    if kind == "group" && inner.persisted.owner_id.is_none() {
        return Err("Pair Zero's private account first".into());
    }
    let pairing = Pairing {
        kind,
        code: uuid::Uuid::new_v4().simple().to_string()[..16].into(),
        expires_at: now() + 600,
        candidate_user_id: None,
        candidate_chat_id: None,
    };
    inner.pairing = Some(pairing.clone());
    Ok(pairing)
}
#[tauri::command]
pub async fn tg_confirm_pairing(app: AppHandle) -> Result<(), String> {
    ready(&app)?;
    let pairing = app
        .state::<TelegramBots>()
        .0
        .lock()
        .unwrap()
        .pairing
        .clone()
        .filter(|p| p.expires_at > now())
        .ok_or("Pairing code expired")?;
    let user = pairing
        .candidate_user_id
        .ok_or("Send the pairing command to HQ first")?;
    let chat = pairing
        .candidate_chat_id
        .ok_or("No pairing candidate received")?;
    if pairing.kind == "group" {
        let info = api("hq", "getChat", json!({"chat_id":chat})).await?;
        if !matches!(info["type"].as_str(), Some("group" | "supergroup"))
            || info["username"].as_str().is_some()
        {
            return Err("Select a private group without a public username".into());
        }
    }
    if !app.dialog().message(format!("Zero, bind Telegram {}?\nNumeric owner: {user}\nChat: {chat}\nOnly this numeric account may control protected actions.",pairing.kind)).title("Confirm Telegram pairing").buttons(MessageDialogButtons::OkCancel).blocking_show() { return Err("Pairing cancelled".into()) }
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    if inner
        .pairing
        .as_ref()
        .is_none_or(|p| p.code != pairing.code || p.expires_at <= now())
    {
        return Err("Pairing was replaced or expired".into());
    }
    if pairing.kind == "owner" {
        inner.persisted.owner_id = Some(user);
        inner.persisted.private_chat_id = Some(chat);
        inner.persisted.group_chat_id = None;
        inner.commands.clear();
        inner.persisted.queue.clear();
        inner.reminders.clear();
    } else {
        if inner.persisted.owner_id != Some(user) {
            return Err("Group sender is not the paired owner".into());
        }
        inner.persisted.group_chat_id = Some(chat);
        inner.commands.clear();
    }
    inner.pairing = None;
    persist(&app, &inner.persisted)?;
    drop(inner);
    changed(&app);
    Ok(())
}
fn authorized(p: &Persisted, user: i64, chat: i64, kind: &str) -> bool {
    p.owner_id == Some(user)
        && (kind == "private" && p.private_chat_id == Some(chat)
            || matches!(kind, "group" | "supergroup") && p.group_chat_id == Some(chat))
}
fn parse_command<'a>(text: &'a str, actual: &str) -> Option<(&'a str, Vec<&'a str>)> {
    let mut parts = text.split_whitespace();
    let raw = parts.next()?;
    if !raw.starts_with('/') {
        return None;
    }
    let command = if let Some((command, mention)) = raw.split_once('@') {
        if !mention.eq_ignore_ascii_case(actual) {
            return None;
        }
        command
    } else {
        raw
    };
    Some((command, parts.collect()))
}
async fn handle_update(
    app: &AppHandle,
    id: &str,
    generation: &str,
    update: &Value,
) -> Result<(), String> {
    let callback = &update["callback_query"];
    let is_callback = !callback.is_null();
    let message = if is_callback {
        &callback["message"]
    } else {
        &update["message"]
    };
    let sender = if is_callback {
        &callback["from"]
    } else {
        &message["from"]
    };
    if sender["is_bot"] == true {
        return Ok(());
    }
    let Some(user) = sender["id"].as_i64().filter(|n| *n > 0) else {
        return Ok(());
    };
    let Some(chat) = message["chat"]["id"].as_i64() else {
        return Ok(());
    };
    let kind = message["chat"]["type"].as_str().unwrap_or("");
    let text = message["text"].as_str().unwrap_or("");
    let actual = {
        let state = app.state::<TelegramBots>();
        let inner = state.0.lock().unwrap();
        inner
            .persisted
            .bots
            .iter()
            .find(|b| b.config.id == id)
            .and_then(|b| b.actual_username.clone())
            .unwrap_or_default()
    };
    let parsed = parse_command(text, &actual);
    // Only HQ accepts pairing, and every captured account still needs native confirmation.
    if id == "hq" && !is_callback {
        let state = app.state::<TelegramBots>();
        let mut inner = state.0.lock().unwrap();
        if !receiver_current(&inner, id, generation) {
            return Ok(());
        }
        let owner = inner.persisted.owner_id;
        if let Some(pair) = inner
            .pairing
            .as_mut()
            .filter(|p| p.expires_at > now() && p.candidate_user_id.is_none())
        {
            let exact = parsed
                .as_ref()
                .is_some_and(|(_, args)| args.len() == 1 && args[0] == pair.code);
            let matches = exact
                && if pair.kind == "owner" {
                    kind == "private"
                        && parsed
                            .as_ref()
                            .is_some_and(|(command, _)| *command == "/start")
                } else {
                    matches!(kind, "group" | "supergroup")
                        && owner == Some(user)
                        && parsed
                            .as_ref()
                            .is_some_and(|(command, _)| *command == "/pair")
                };
            if matches {
                pair.candidate_user_id = Some(user);
                pair.candidate_chat_id = Some(chat);
                drop(inner);
                changed(app);
                return Ok(());
            }
        }
    }
    let (allowed, permissions) = {
        let state = app.state::<TelegramBots>();
        let inner = state.0.lock().unwrap();
        (
            receiver_current(&inner, id, generation)
                && authorized(&inner.persisted, user, chat, kind),
            inner
                .persisted
                .bots
                .iter()
                .find(|b| b.config.id == id)
                .unwrap()
                .config
                .permissions
                .clone(),
        )
    };
    if !allowed {
        return Ok(());
    }
    if is_callback {
        let data = callback["data"].as_str().unwrap_or("");
        let cbid = callback["id"].as_str().unwrap_or("");
        if cbid.len() > 256 {
            return Ok(());
        }
        let (action, revision) = data.split_once(':').unwrap_or(("", ""));
        if uuid::Uuid::parse_str(revision).is_err() {
            return Ok(());
        }
        if action == "receipt" {
            let state = app.state::<TelegramBots>();
            let mut inner = state.0.lock().unwrap();
            let valid = if let Some(delivery) = inner.persisted.deliveries.iter_mut().find(|d| {
                d.id == revision
                    && d.bot_id == id
                    && d.kind == "test"
                    && d.at + 900 > now()
                    && ["queued", "sent"].contains(&d.status.as_str())
            }) {
                delivery.status = "received".into();
                persist(app, &inner.persisted)?;
                true
            } else {
                false
            };
            drop(inner);
            changed(app);
            let _=api(id,"answerCallbackQuery",json!({"callback_query_id":cbid,"text":if valid{"Receipt verified in The Swarm."}else{"Receipt expired, unknown, or already confirmed."}})).await;
            return Ok(());
        }
        if id != "hq" || !permissions.approvals {
            return Ok(());
        }
        if action == "review" {
            let info = app
                .state::<crate::approvals::ApprovalBook>()
                .info(revision)?;
            let _ = app.emit(
                "tg-review",
                json!({"approvalId":info.id,"runId":info.run_id}),
            );
            return api(id,"answerCallbackQuery",json!({"callback_query_id":cbid,"text":"Proposal identified in The Swarm desktop. Inspect its diff there."})).await.map(|_|());
        }
        if !["approve", "reject"].contains(&action) {
            return Ok(());
        }
        let outcome = {
            let state = app.state::<TelegramBots>();
            let inner = state.0.lock().unwrap();
            if !receiver_current(&inner, id, generation)
                || !authorized(&inner.persisted, user, chat, kind)
                || !inner
                    .persisted
                    .bots
                    .iter()
                    .find(|b| b.config.id == "hq")
                    .unwrap()
                    .config
                    .permissions
                    .approvals
            {
                return Err("Telegram owner binding, receiver, or HQ permissions changed".into());
            }
            crate::approvals::owner_decision(app, revision, action == "approve", "telegram-hq")
        };
        let reply=match outcome { Ok(_) if action=="reject"=>"Zero rejected this exact revision.",Ok(_)=>"Zero approved this exact revision. Inspect its outcome in The Swarm.",Err(ref e) if e.contains("Desktop confirmation")=>"Approval intent recorded. Native desktop confirmation is required before changes can be applied.",_=>"Revision expired, was already handled, or could not be applied. Review in The Swarm." };
        api(
            id,
            "answerCallbackQuery",
            json!({"callback_query_id":cbid,"text":reply}),
        )
        .await?;
        api(id, "sendMessage", json!({"chat_id":chat,"text":reply})).await?;
        return Ok(());
    }
    if !permissions.commands {
        return Ok(());
    }
    let Some((command, _)) = parsed else {
        return Ok(());
    };
    let response=match command {
        "/start"|"/help"=>"The Swarm: /status /agents /projects /tasks /approvals /pause /resume. Only Zero's paired numeric account may control protected actions. No bot-to-bot commands are accepted.".into(),
        "/status"=>{let state=app.state::<TelegramBots>();let inner=state.0.lock().unwrap();if now().saturating_sub(inner.synced_at)>90{"Telegram receiver is online. The desktop workspace snapshot is unavailable; open The Swarm to refresh it. AI readiness is separate.".into()}else{format!("The Swarm desktop is online. Telegram identity is connected; AI provider readiness is separate. Current run: {} · {}.",inner.workspace.active_run_id.as_deref().unwrap_or("none"),inner.workspace.active_status.as_deref().unwrap_or("idle"))}},
        "/agents"|"/projects"|"/tasks"=>{let state=app.state::<TelegramBots>();let inner=state.0.lock().unwrap();if now().saturating_sub(inner.synced_at)>90 { "Workspace status unavailable: open the desktop workspace.".into() } else { let rows:Vec<String>=match command {"/agents"=>inner.workspace.agents.iter().map(|r|format!("{} · {}",r.id,r.status)).collect(),"/projects"=>inner.workspace.projects.iter().map(|r|format!("{} · {}",r.id,r.status)).collect(),_=>inner.workspace.tasks.iter().map(|r|format!("{} · {} · {}",r.project_id,r.id,r.status)).collect()};format!("{}\n{}",command.trim_start_matches('/'),if rows.is_empty(){"None in the current workspace snapshot.".into()}else{rows.join("\n")})}},
        "/approvals"=>{let pending=app.state::<crate::approvals::ApprovalBook>().pending();format!("Pending owner approvals: {}. Review exact revisions in The Swarm desktop.\n{}",pending.len(),pending.iter().map(|p|format!("{} · project {} · task {}",p.id,p.project_id,p.task_id)).collect::<Vec<_>>().join("\n"))},
        "/pause"|"/resume"=>{
            let state=app.state::<TelegramBots>();let mut inner=state.0.lock().unwrap();
            if !receiver_current(&inner,id,generation)||!authorized(&inner.persisted,user,chat,kind){return Ok(())}let run=inner.workspace.active_run_id.clone();
            if now().saturating_sub(inner.synced_at)>90 || run.is_none() { "No current live workflow is available to control.".into() }
            else { let run=run.unwrap();let request=uuid::Uuid::new_v4().to_string();inner.commands.retain(|_,p|p.expires>now());inner.commands.insert(request.clone(),PendingCommand {bot_id:id.into(),chat_id:chat,run_id:run.clone(),expires:now()+15});drop(inner);let _=app.emit("tg-command",json!({"requestId":request,"command":command.trim_start_matches('/'),"runId":run}));"Command requested from the actual desktop controller. Awaiting its result.".into() }
        },
        _=>return Ok(())
    };
    api(id, "sendMessage", json!({"chat_id":chat,"text":response})).await?;
    Ok(())
}

#[tauri::command]
pub fn tg_save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    ready(&app)?;
    if !(5..=3600).contains(&settings.min_interval_secs)
        || !(60..=86400).contains(&settings.reminder_delay_secs)
        || settings.max_reminders > 3
        || settings.quiet_start.is_some_and(|h| h > 23)
        || settings.quiet_end.is_some_and(|h| h > 23)
    {
        return Err(
            "Invalid Telegram notification frequency, quiet hours, or reminder limits".into(),
        );
    }
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    inner.persisted.settings = settings;
    persist(&app, &inner.persisted)?;
    drop(inner);
    changed(&app);
    Ok(())
}
#[tauri::command]
pub fn tg_sync_workspace(app: AppHandle, workspace: Workspace) -> Result<(), String> {
    let status = |s: &str| {
        s.len() < 40
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    };
    if workspace.projects.len() > 100
        || workspace.agents.len() > 20
        || workspace.tasks.len() > 100
        || workspace
            .projects
            .iter()
            .chain(&workspace.agents)
            .any(|r| !valid_ref(&r.id) || !status(&r.status))
        || workspace.tasks.iter().any(|r| {
            !valid_ref(&r.id)
                || !valid_ref(&r.project_id)
                || !valid_ref(&r.run_id)
                || !status(&r.status)
        })
        || workspace
            .active_run_id
            .as_ref()
            .is_some_and(|s| !valid_ref(s))
        || workspace.active_status.as_ref().is_some_and(|s| !status(s))
    {
        return Err("Workspace bridge accepts bounded identifiers and states only".into());
    }
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    inner.workspace = workspace;
    inner.synced_at = now();
    Ok(())
}
#[tauri::command]
pub async fn tg_command_result(
    app: AppHandle,
    request_id: String,
    run_id: String,
    applied: bool,
) -> Result<(), String> {
    let pending = app
        .state::<TelegramBots>()
        .0
        .lock()
        .unwrap()
        .commands
        .remove(&request_id)
        .ok_or("Unknown or completed Telegram command")?;
    if pending.expires <= now() || pending.run_id != run_id {
        return Err("Telegram command context expired or changed".into());
    }
    api(&pending.bot_id,"sendMessage",json!({"chat_id":pending.chat_id,"text":format!("Desktop controller result · run {run_id}: {}",if applied {"requested state confirmed"}else{"action unavailable; state unchanged"})})).await?;
    Ok(())
}
fn destination(inner: &Inner) -> Result<i64, String> {
    inner
        .persisted
        .group_chat_id
        .or(inner.persisted.private_chat_id)
        .ok_or("Pair Zero's private Telegram account first".into())
}
fn delivery(
    inner: &mut Inner,
    bot: &str,
    kind: &str,
    status: &str,
    reference: &str,
    error: Option<String>,
) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    inner.persisted.deliveries.insert(
        0,
        Delivery {
            id: id.clone(),
            bot_id: bot.into(),
            kind: kind.into(),
            status: status.into(),
            at: now(),
            reference: reference.into(),
            error,
        },
    );
    inner.persisted.deliveries.truncate(100);
    id
}
#[tauri::command]
pub async fn tg_send_test(app: AppHandle, bot_id: String) -> Result<(), String> {
    ready(&app)?;
    let (chat, receipt) = {
        let state = app.state::<TelegramBots>();
        let mut inner = state.0.lock().unwrap();
        let config = inner
            .persisted
            .bots
            .iter()
            .find(|b| b.config.id == bot_id)
            .ok_or("Unknown bot")?;
        if !config.config.permissions.test_messages {
            return Err("Test messages are disabled for this bot".into());
        }
        if !inner.runtime.get(&bot_id).is_some_and(|r| r.verified) {
            return Err("Verify this bot with getMe first".into());
        }
        let chat = destination(&inner)?;
        let receipt = delivery(&mut inner, &bot_id, "test", "queued", "user-test", None);
        persist(&app, &inner.persisted)?;
        (chat, receipt)
    };
    let result=verified_api(&app,&bot_id,"sendMessage",json!({"chat_id":chat,"text":format!("The Swarm · {bot_id} connection test. This confirms Telegram delivery only; AI provider readiness is separate. Tap Confirm received to verify the return path."),"reply_markup":{"inline_keyboard":[[{"text":"Confirm received","callback_data":format!("receipt:{receipt}")}]]}})).await;
    {
        let state = app.state::<TelegramBots>();
        let mut inner = state.0.lock().unwrap();
        if let Some(d) = inner
            .persisted
            .deliveries
            .iter_mut()
            .find(|d| d.id == receipt)
        {
            if d.status != "received" {
                d.status = if result.is_ok() { "sent" } else { "failed" }.into();
                d.error = result.as_ref().err().cloned();
            }
        }
        persist(&app, &inner.persisted)?;
    }
    changed(&app);
    result.map(|_| ())
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationalEvent {
    pub id: String,
    pub kind: String,
    pub project_id: String,
    pub task_id: String,
    pub run_id: String,
    pub agent_id: String,
    pub status: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueuedEvent {
    bot_id: String,
    event: OperationalEvent,
    due: u64,
    attempts: u32,
}
fn mapped_role(id: &str) -> &str {
    match id {
        "codex" => "planner",
        "claude-code" => "backend",
        "gemini-cli" => "frontend",
        "cursor-cli" => "qa",
        "grok" => "researcher",
        "ollama" => "docs",
        _ => id,
    }
}
#[tauri::command]
pub async fn tg_publish_event(app: AppHandle, event: OperationalEvent) -> Result<(), String> {
    ready(&app)?;
    if !KINDS.contains(&event.kind.as_str())
        || [
            &event.id,
            &event.project_id,
            &event.task_id,
            &event.run_id,
            &event.agent_id,
            &event.status,
        ]
        .iter()
        .any(|s| !valid_ref(s))
    {
        return Err(
            "Operational messages accept known event types and opaque references only".into(),
        );
    }
    let targets = {
        let state = app.state::<TelegramBots>();
        let inner = state.0.lock().unwrap();
        inner
            .persisted
            .bots
            .iter()
            .filter(|b| b.config.id == "hq" || b.config.role == mapped_role(&event.agent_id))
            .map(|b| b.config.id.clone())
            .collect::<Vec<_>>()
    };
    for id in targets {
        enqueue(&app, &id, &event)?;
    }
    flush_queue(&app).await
}
fn enqueue(app: &AppHandle, id: &str, event: &OperationalEvent) -> Result<(), String> {
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    let config = inner
        .persisted
        .bots
        .iter()
        .find(|b| b.config.id == id)
        .unwrap()
        .config
        .clone();
    let settings = inner.persisted.settings.clone();
    let dedup = format!("{id}:{}", event.id);
    if inner.persisted.dedup.contains(&dedup) {
        return Ok(());
    }
    if destination(&inner).is_err() {
        return Ok(());
    }
    let permitted = settings.notifications
        && config.permissions.notifications
        && (event.kind != "critical_alert" || settings.critical_alerts)
        && inner.runtime.get(id).is_some_and(|r| r.verified);
    inner.persisted.dedup.push(dedup);
    if inner.persisted.dedup.len() > 1000 {
        inner.persisted.dedup.drain(..200);
    }
    if !permitted {
        delivery(&mut inner, id, &event.kind, "suppressed", &event.id, None);
        persist(app, &inner.persisted)?;
        return Ok(());
    }
    if inner.persisted.queue.len() >= 200 {
        let position = inner
            .persisted
            .queue
            .iter()
            .position(|q| {
                !["workflow_finished", "task_failed", "critical_alert"]
                    .contains(&q.event.kind.as_str())
            })
            .unwrap_or(0);
        let old = inner.persisted.queue.remove(position);
        delivery(
            &mut inner,
            &old.bot_id,
            &old.event.kind,
            "suppressed",
            &old.event.id,
            Some("Bounded delivery queue capacity reached".into()),
        );
    }
    inner.persisted.queue.push(QueuedEvent {
        bot_id: id.into(),
        event: event.clone(),
        due: now(),
        attempts: 0,
    });
    delivery(&mut inner, id, &event.kind, "queued", &event.id, None);
    persist(app, &inner.persisted)?;
    drop(inner);
    changed(app);
    Ok(())
}
fn retry_delay(message: &str, attempt: u32) -> u64 {
    message
        .strip_prefix("Telegram rate limit. Retry after ")
        .and_then(|s| s.split_whitespace().next())
        .and_then(|s| s.parse::<u64>().ok())
        .map(|s| s.clamp(1, 3600))
        .unwrap_or_else(|| backoff(attempt))
}
async fn flush_queue(app: &AppHandle) -> Result<(), String> {
    // Removing a claimed item before awaiting prevents concurrent publishers
    // from sending it twice. A failed network request is explicitly requeued.
    for _ in 0..7 {
        let selected = {
            let state = app.state::<TelegramBots>();
            let mut inner = state.0.lock().unwrap();
            let settings = inner.persisted.settings.clone();
            if !settings.notifications || quiet(&settings, now()) {
                return Ok(());
            }
            let position = inner.persisted.queue.iter().position(|q| {
                q.due <= now()
                    && inner.runtime.get(&q.bot_id).is_some_and(|r| r.verified)
                    && inner.last_send.get(&q.bot_id).is_none_or(|last| {
                        now().saturating_sub(*last) >= settings.min_interval_secs
                    })
            });
            let Some(position) = position else {
                return Ok(());
            };
            let item = inner.persisted.queue.remove(position);
            let config = inner
                .persisted
                .bots
                .iter()
                .find(|b| b.config.id == item.bot_id)
                .unwrap()
                .config
                .clone();
            if !config.permissions.notifications {
                delivery(
                    &mut inner,
                    &item.bot_id,
                    &item.event.kind,
                    "suppressed",
                    &item.event.id,
                    None,
                );
                persist(app, &inner.persisted)?;
                continue;
            }
            let chat = destination(&inner)?;
            inner.last_send.insert(item.bot_id.clone(), now());
            persist(app, &inner.persisted)?;
            let intro = if settings.personalities {
                format!(
                    "{} [Personality style: {}]",
                    style_intro(&config.style),
                    config.style
                )
            } else {
                "The Swarm".into()
            };
            (item, chat, intro)
        };
        let (mut item, chat, intro) = selected;
        let event = &item.event;
        let id = &item.bot_id;
        let text = format!(
            "{intro} · {}\nAgent: {id}\nProject: {}\nTask: {}\nRun: {}\nEvent: {}\nState: {}",
            event.kind.replace('_', " "),
            event.project_id,
            event.task_id,
            event.run_id,
            event.id,
            event.status
        );
        let result =
            verified_api(app, id, "sendMessage", json!({"chat_id":chat,"text":text})).await;
        let state = app.state::<TelegramBots>();
        let mut inner = state.0.lock().unwrap();
        delivery(
            &mut inner,
            id,
            &event.kind,
            if result.is_ok() { "sent" } else { "failed" },
            &event.id,
            result.as_ref().err().cloned(),
        );
        if let Err(e) = result {
            item.attempts += 1;
            if item.attempts < 5 {
                item.due = now() + retry_delay(&e, item.attempts);
                inner.persisted.queue.push(item);
            }
        }
        persist(app, &inner.persisted)?;
        drop(inner);
        changed(app);
    }
    Ok(())
}
fn style_intro(style: &str) -> &'static str {
    match style {
        "strategic" => "Engineering coordination",
        "collaborative" => "Team update",
        "creative" => "Interface update",
        "meticulous" => "Evidence check",
        "witty" => "Research radar",
        "practical" => "Local support",
        _ => "Swarm Headquarters",
    }
}
#[tauri::command]
pub async fn tg_request_approval(app: AppHandle, approval_id: String) -> Result<(), String> {
    ready(&app)?;
    let info = app
        .state::<crate::approvals::ApprovalBook>()
        .info(&approval_id)?;
    let chat = {
        let state = app.state::<TelegramBots>();
        let inner = state.0.lock().unwrap();
        if !inner
            .persisted
            .bots
            .iter()
            .find(|b| b.config.id == "hq")
            .unwrap()
            .config
            .permissions
            .approvals
        {
            return Err("HQ approval notifications are disabled".into());
        }
        if !inner.runtime.get("hq").is_some_and(|r| r.verified) {
            return Err("Verify HQ first".into());
        }
        destination(&inner)?
    };
    let policy = if info.risk == "high" {
        "High risk: Telegram records intent; native desktop confirmation is required."
    } else {
        "Owner authorization applies to this exact revision only."
    };
    verified_api(&app,"hq","sendMessage",json!({"chat_id":chat,"text":format!("Zero, a reviewed proposal needs your decision.\nProject: {}\nTask: {}\nRun: {}\nRevision: {}\n{} files. {policy}\nInspect the exact contents in The Swarm desktop. Expires at {} UTC epoch seconds.",info.project_id,info.task_id,info.run_id,info.id,info.paths.len(),info.expires_at),"reply_markup":{"inline_keyboard":[[{"text":"Review in desktop","callback_data":format!("review:{}",info.id)}],[{"text":if info.risk=="high"{"Record approval intent"}else{"Approve exact revision"},"callback_data":format!("approve:{}",info.id)},{"text":"Reject","callback_data":format!("reject:{}",info.id)}]]}})).await?;
    let state = app.state::<TelegramBots>();
    let mut inner = state.0.lock().unwrap();
    delivery(&mut inner, "hq", "approval", "sent", &approval_id, None);
    inner.reminders.insert(approval_id, (now(), 0));
    persist(&app, &inner.persisted)?;
    drop(inner);
    changed(&app);
    Ok(())
}
#[tauri::command]
pub async fn tg_approval_probe(app: AppHandle) -> Result<crate::approvals::ApprovalInfo, String> {
    let info = crate::approvals::stage_probe(&app)?;
    tg_request_approval(app, info.id.clone()).await?;
    Ok(info)
}
async fn remind(app: &AppHandle) -> Result<(), String> {
    let pending = app.state::<crate::approvals::ApprovalBook>().pending();
    let live: HashSet<_> = pending.iter().map(|p| p.id.clone()).collect();
    let (chat, ids) = {
        let state = app.state::<TelegramBots>();
        let mut inner = state.0.lock().unwrap();
        inner.reminders.retain(|id, _| live.contains(id));
        let settings = inner.persisted.settings.clone();
        let hq = inner
            .persisted
            .bots
            .iter()
            .find(|b| b.config.id == "hq")
            .unwrap();
        if !settings.notifications
            || !hq.config.permissions.notifications
            || !hq.config.permissions.approvals
            || !inner.runtime.get("hq").is_some_and(|r| r.verified)
            || !settings.personalities
            || !settings.reminders
            || settings.max_reminders == 0
            || quiet(&settings, now())
        {
            return Ok(());
        }
        let chat = destination(&inner)?;
        let mut ids = vec![];
        for (id, (at, count)) in inner.reminders.iter_mut() {
            if *count < settings.max_reminders
                && now().saturating_sub(*at) >= settings.reminder_delay_secs
            {
                *at = now();
                *count += 1;
                ids.push(id.clone());
            }
        }
        (chat, ids)
    };
    for id in ids {
        verified_api(app,"hq","sendMessage",json!({"chat_id":chat,"text":format!("Personality reminder · Where's Zero? A real approval is still pending. Revision {id}. Open The Swarm when ready; no work was started by this reminder.")})).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identity_mismatch_and_non_bot_are_rejected() {
        let bot = json!({"id":42,"is_bot":true,"username":"ExpectedBot"});
        assert_eq!(identity(&bot, "expectedbot").unwrap().0, 42);
        assert!(identity(&bot, "DifferentBot").is_err());
        assert!(identity(
            &json!({"id":42,"is_bot":false,"username":"ExpectedBot"}),
            "ExpectedBot"
        )
        .is_err());
    }
    #[test]
    fn only_owner_and_allowlisted_chats_are_authorized() {
        let mut p = Persisted::default();
        p.owner_id = Some(7);
        p.private_chat_id = Some(7);
        p.group_chat_id = Some(-100);
        assert!(authorized(&p, 7, 7, "private"));
        assert!(authorized(&p, 7, -100, "supergroup"));
        assert!(!authorized(&p, 8, -100, "supergroup"));
        assert!(!authorized(&p, 7, -101, "supergroup"));
        assert!(!authorized(&p, 7, 7, "group"));
    }
    #[test]
    fn seven_slots_have_independent_offsets_and_no_credential_columns() {
        let mut p = Persisted::default();
        p.bots[0].offset = 90;
        p.bots[1].offset = 4;
        let saved = serde_json::to_string(&p).unwrap();
        let restored: Persisted = serde_json::from_str(&saved).unwrap();
        assert_eq!(restored.bots.len(), 7);
        assert_eq!(restored.bots[0].offset, 90);
        assert_eq!(restored.bots[1].offset, 4);
        assert!(!saved.contains("TOKEN"));
        assert!(!saved.contains("tokenPresent"));
    }
    #[test]
    fn replacement_stops_receiver_and_revokes_verification() {
        let mut inner = Inner::default();
        inner.runtime.insert(
            "hq".into(),
            Runtime {
                verified: true,
                status: "listening".into(),
                error: None,
            },
        );
        inner.persisted.bots[0].actual_username = Some("ZeroPulseSwarmHQBot".into());
        inner.persisted.bots[0].bot_id = Some(42);
        let cancel = Arc::new(AtomicBool::new(false));
        inner.receivers.insert(
            "hq".into(),
            Receiver {
                cancel: cancel.clone(),
                generation: "a".into(),
            },
        );
        invalidate(&mut inner, "hq");
        assert!(cancel.load(Ordering::SeqCst));
        assert!(!inner.runtime["hq"].verified);
        assert!(inner.persisted.bots[0].bot_id.is_none());
    }
    #[test]
    fn quiet_hours_wrap_midnight_and_backoff_is_bounded() {
        let mut s = Settings::default();
        s.quiet_start = Some(22);
        s.quiet_end = Some(7);
        assert!(quiet(&s, 23 * 3600));
        assert!(quiet(&s, 2 * 3600));
        assert!(!quiet(&s, 12 * 3600));
        assert_eq!(backoff(99), 60);
    }
    #[test]
    fn errors_are_actionable_without_response_or_token_data() {
        assert!(api_error(401, None).contains("authentication"));
        assert!(api_error(409, None).contains("conflict"));
        assert!(api_error(429, Some(12)).contains("12 seconds"));
    }
    #[test]
    fn agent_bots_cannot_gain_approval_permissions() {
        let mut c = Persisted::default().bots[1].config.clone();
        c.permissions.approvals = true;
        assert!(validate_config(&c).is_err());
        c.permissions.approvals = false;
        c.expected_username = "ImposterBot".into();
        assert!(validate_config(&c).is_err());
    }
    #[test]
    fn persisted_notification_dedup_survives_restart() {
        let mut p = Persisted::default();
        p.dedup.push("hq:event-1".into());
        let restored: Persisted =
            serde_json::from_str(&serde_json::to_string(&p).unwrap()).unwrap();
        assert!(restored.dedup.contains(&"hq:event-1".into()));
        assert!(!restored.dedup.contains(&"codex:event-1".into()));
    }
    #[test]
    fn failed_offset_commit_does_not_acknowledge_undispatched_update() {
        let mut p = Persisted::default();
        p.bots[0].offset = 10;
        assert!(commit_offset(&mut p, "hq", 11, |_| Err("disk full".into())).is_err());
        assert_eq!(p.bots[0].offset, 10);
        assert!(commit_offset(&mut p, "hq", 11, |_| Ok(())).unwrap());
        assert_eq!(p.bots[0].offset, 12);
        assert!(!commit_offset(&mut p, "hq", 11, |_| panic!(
            "duplicate must not be committed"
        ))
        .unwrap());
    }
    #[test]
    fn only_this_bots_mentions_are_routed() {
        let parsed = parse_command("/pair@ZeroPulseSwarmHQBot abc", "ZeroPulseSwarmHQBot").unwrap();
        assert_eq!(parsed.0, "/pair");
        assert_eq!(parsed.1, ["abc"]);
        assert!(parse_command("/pause@OtherBot", "ZeroPulseSwarmHQBot").is_none());
        assert!(parse_command("Hello", "ZeroPulseSwarmHQBot").is_none());
    }
    #[test]
    fn active_or_unknown_webhooks_block_polling() {
        assert!(polling_allowed(&json!({"url":"https://example.test/hook"})).is_err());
        assert!(polling_allowed(&json!({})).is_err());
        assert!(polling_allowed(&json!({"url":""})).is_ok());
    }
    #[test]
    fn receiver_os_lease_prevents_parallel_pollers_but_allows_independent_bots() {
        let dir = std::env::temp_dir().join(format!("swarm-tg-lock-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&dir).unwrap();
        let first = lease_file(dir.join("bot-1.lock")).unwrap();
        assert!(lease_file(dir.join("bot-1.lock")).is_err());
        let second = lease_file(dir.join("bot-2.lock")).unwrap();
        drop(first);
        let restarted = lease_file(dir.join("bot-1.lock")).unwrap();
        drop(restarted);
        drop(second);
        std::fs::remove_file(dir.join("bot-1.lock")).unwrap();
        std::fs::remove_file(dir.join("bot-2.lock")).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
