//! Optional Telegram boundary: fixed summaries only, authenticated owner callbacks,
//! bounded bodies, idempotency, and voice attachments kept separate from instructions.
use std::{collections::HashSet, io::Read, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::Duration};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

const PORT: u16 = 9462;
const MAX_BODY: usize = 128_000;
#[derive(Clone, Deserialize, Serialize)] #[serde(rename_all = "camelCase")]
pub struct Config { pub owner_id: i64, pub chat_id: i64, pub webhook_url: String }
#[derive(Clone, Serialize)] #[serde(rename_all = "camelCase")]
pub struct Voice { id: String, duration: u64, #[serde(skip)] file_id: String }
#[derive(Default)] pub struct Telegram { stop: Mutex<Option<Arc<AtomicBool>>>, config: Mutex<Option<Config>>, voices: Mutex<Vec<Voice>>, seen: Mutex<HashSet<i64>>, last_error: Mutex<Option<String>> }
#[derive(Serialize)] #[serde(rename_all = "camelCase")]
pub struct Status { enabled: bool, token_present: bool, webhook_secret_present: bool, port: u16, error: Option<String>, voices: Vec<Voice> }

fn secret_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() || a.is_empty() { return false }
    a.bytes().zip(b.bytes()).fold(0u8, |n, (a,b)| n | (a ^ b)) == 0
}
#[derive(Debug, PartialEq)] enum Action { Decision { id: String, approve: bool, callback: String }, Review { id: String, callback: String }, Voice { file_id: String, duration: u64 }, Status, Ignore }

fn validate(config: &Config, secret: &str, header: &str, body: &[u8]) -> Result<(i64, Action), String> {
    if !secret_eq(secret, header) { return Err("Unauthorized webhook".into()) }
    if body.len() > MAX_BODY { return Err("Webhook body too large".into()) }
    let v: Value = serde_json::from_slice(body).map_err(|_| "Malformed JSON")?;
    let update = v["update_id"].as_i64().filter(|n| *n >= 0).ok_or("Missing update ID")?;
    let callback = !v["callback_query"].is_null();
    let m = if callback { &v["callback_query"]["message"] } else { &v["message"] };
    let sender = if callback { &v["callback_query"]["from"] } else { &m["from"] };
    if sender["id"].as_i64() != Some(config.owner_id) || sender["is_bot"] == true || m["chat"]["id"].as_i64() != Some(config.chat_id) || m["chat"]["type"] != "private" { return Err("Only Zero in the configured private chat is authorized".into()) }
    if callback {
        let data = v["callback_query"]["data"].as_str().ok_or("Missing callback data")?;
        let (decision, id) = data.split_once(':').ok_or("Invalid callback")?;
        if !["approve", "reject", "review"].contains(&decision) || uuid::Uuid::parse_str(id).is_err() { return Err("Invalid approval callback".into()) }
        let callback = v["callback_query"]["id"].as_str().ok_or("Missing callback ID")?.to_string();
        if decision == "review" { return Ok((update, Action::Review { id: id.into(), callback })) }
        return Ok((update, Action::Decision { id: id.into(), approve: decision == "approve", callback }))
    }
    if let Some(file_id) = m["voice"]["file_id"].as_str() {
        if m["voice"]["file_size"].as_u64().unwrap_or(u64::MAX) > 5_000_000 { return Err("Voice note exceeds 5 MB".into()) }
        return Ok((update, Action::Voice { file_id: file_id.into(), duration: m["voice"]["duration"].as_u64().unwrap_or(0) }))
    }
    Ok((update, if matches!(m["text"].as_str(), Some("/status" | "/start" | "/help")) { Action::Status } else { Action::Ignore }))
}

fn token() -> Result<String, String> { crate::secrets::lookup("TELEGRAM_BOT_TOKEN").ok_or("Save TELEGRAM_BOT_TOKEN in Integrations first".into()) }
async fn api(method: &str, body: Value) -> Result<Value, String> {
    let token = token()?;
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(20)).build().map_err(|_| "Telegram client unavailable")?;
    let response = client.post(format!("https://api.telegram.org/bot{token}/{method}")).json(&body).send().await.map_err(|_| "Telegram could not be reached")?;
    if !response.status().is_success() { return Err("Telegram rejected the request. Check the bot token, chat and webhook URL.".into()) }
    let value: Value = response.json().await.map_err(|_| "Invalid Telegram response")?;
    if value["ok"] != true { return Err("Telegram did not accept the request".into()) } Ok(value["result"].clone())
}

#[tauri::command]
pub fn telegram_status(state: State<'_, Telegram>) -> Status {
    Status { enabled: state.config.lock().unwrap().is_some(), token_present: token().is_ok(), webhook_secret_present: crate::secrets::lookup("TELEGRAM_WEBHOOK_TOKEN").is_some(), port: PORT, error: state.last_error.lock().unwrap().clone(), voices: state.voices.lock().unwrap().clone() }
}

#[tauri::command]
pub async fn telegram_start(app: AppHandle, config: Config) -> Result<(), String> {
    if config.owner_id <= 0 || config.chat_id <= 0 { return Err("Positive numeric owner and private chat IDs are required".into()) }
    let url = reqwest::Url::parse(&config.webhook_url).map_err(|_| "Invalid webhook URL")?;
    if url.scheme() != "https" || url.path() != "/telegram/webhook" || !url.username().is_empty() || url.password().is_some() || url.query().is_some() { return Err("Use https://your-tunnel-host/telegram/webhook, with no credentials or query".into()) }
    let secret = crate::secrets::lookup("TELEGRAM_WEBHOOK_TOKEN").ok_or("Save a random TELEGRAM_WEBHOOK_TOKEN first")?;
    if secret.len() < 32 || secret.len() > 256 || !secret.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-') { return Err("Webhook token must be 32–256 letters, digits, underscores or hyphens".into()) }
    let bot_token = token()?;
    crate::telegram_bots::ensure_legacy_available(&app, &bot_token)?;
    if app.state::<Telegram>().config.lock().unwrap().is_some() { return Err("Disconnect Telegram before changing its configuration".into()) }
    if !app.dialog().message(format!("Zero, enable Telegram owner controls?\nOwner ID: {}\nPrivate chat: {}\nWebhook: {}\n\nThis user may approve or reject staged proposals. Only fixed summaries leave the app automatically.", config.owner_id, config.chat_id, config.webhook_url)).title("The Swarm — Telegram owner binding").buttons(MessageDialogButtons::OkCancel).blocking_show() { return Err("Telegram setup cancelled".into()) }
    let server = tiny_http::Server::http(("127.0.0.1", PORT)).map_err(|_| "Telegram port 9462 is in use")?;
    // Reachability is verified by Telegram; do not mark connected when registration fails.
    api("setWebhook", json!({"url": config.webhook_url, "secret_token": secret, "allowed_updates": ["message", "callback_query"], "drop_pending_updates": true})).await?;
    let stop = Arc::new(AtomicBool::new(false));
    *app.state::<Telegram>().stop.lock().unwrap() = Some(stop.clone());
    *app.state::<Telegram>().config.lock().unwrap() = Some(config.clone());
    *app.state::<Telegram>().last_error.lock().unwrap() = None;
    std::thread::spawn(move || {
        while !stop.load(Ordering::Relaxed) {
            let Ok(Some(mut request)) = server.recv_timeout(Duration::from_millis(200)) else { continue };
            if request.method() != &tiny_http::Method::Post || request.url() != "/telegram/webhook" { let _ = request.respond(tiny_http::Response::empty(404)); continue }
            let header = request.headers().iter().find(|h| h.field.equiv("X-Telegram-Bot-Api-Secret-Token")).map(|h| h.value.as_str().to_string()).unwrap_or_default();
            if !secret_eq(&secret, &header) { let _ = request.respond(tiny_http::Response::empty(401)); continue }
            if request.body_length().is_none_or(|n| n > MAX_BODY) { let _ = request.respond(tiny_http::Response::empty(413)); continue }
            let mut body = Vec::new();
            if request.as_reader().take((MAX_BODY + 1) as u64).read_to_end(&mut body).is_err() { let _ = request.respond(tiny_http::Response::empty(400)); continue }
            let result = validate(&config, &secret, &header, &body);
            let Ok((update, action)) = result else { let _ = request.respond(tiny_http::Response::empty(403)); continue };
            // Serialize handling. Duplicate updates are acknowledged without repeating a side effect.
            { let state = app.state::<Telegram>(); let mut seen = state.seen.lock().unwrap(); if !seen.insert(update) { let _ = request.respond(tiny_http::Response::empty(200)); continue } if seen.len() > 4096 { let min = *seen.iter().min().unwrap(); seen.remove(&min); } }
            let result = tauri::async_runtime::block_on(handle(&app, &config, action));
            if result.is_err() { *app.state::<Telegram>().last_error.lock().unwrap() = Some("A Telegram action failed. Review its current state in the app.".into()); }
            // Approval IDs are consumed before writes; even a delivery retry cannot re-apply.
            let _ = request.respond(tiny_http::Response::empty(200));
        }
    });
    Ok(())
}

async fn handle(app: &AppHandle, config: &Config, action: Action) -> Result<(), String> {
    if app.state::<Telegram>().config.lock().unwrap().is_none() { return Err("Telegram authority has been revoked".into()) }
    match action {
        Action::Decision { id, approve, callback } => {
            let is_probe = app.state::<crate::approvals::ApprovalBook>().info(&id).is_ok_and(|i| i.action == "probe");
            let outcome = crate::approvals::owner_decision(app, &id, approve, "telegram");
            let text = match outcome { Ok(_) if !approve => "Proposal rejected. No changes applied.", Ok(_) if is_probe => "Harmless approval test confirmed by Zero. No project files were changed.", Err(ref e) if e.starts_with("Desktop confirmation required") => "Zero's intent is recorded. This action requires additional native desktop confirmation. No files were written.", Ok(ref rows) if rows.iter().all(|r| r.ok) => "Owner-approved changes applied. Run verification in The Swarm.", _ => "Proposal expired, already handled, or could not be applied. Review in The Swarm." };
            api("answerCallbackQuery", json!({"callback_query_id":callback,"text":text})).await?;
            api("sendMessage", json!({"chat_id":config.chat_id,"text":text})).await?;
        },
        Action::Review { id, callback } => {
            let info = app.state::<crate::approvals::ApprovalBook>().info(&id)?;
            let _ = app.emit("tg-review", json!({"approvalId":info.id,"runId":info.run_id,"projectId":info.project_id,"taskId":info.task_id}));
            api("answerCallbackQuery", json!({"callback_query_id":callback,"text":"Review requested in the desktop app. This does not approve the action."})).await?;
        },
        Action::Voice { file_id, duration } => {
            let voice = Voice { id: uuid::Uuid::new_v4().to_string(), duration, file_id };
            app.state::<Telegram>().voices.lock().unwrap().insert(0, voice.clone());
            app.state::<Telegram>().voices.lock().unwrap().truncate(20);
            let _ = app.emit("swarm-voice", &voice);
            api("sendMessage", json!({"chat_id":config.chat_id,"text":"Voice note received for local playback. It does not authorize changes or start a task."})).await?;
        },
        Action::Status => { let count = app.state::<Telegram>().voices.lock().unwrap().len(); api("sendMessage", json!({"chat_id":config.chat_id,"text":format!("The Swarm is connected. Zero is final authority. {count} voice notes in this session. Review code locally; use the revision-specific buttons to approve or reject.")})).await?; },
        Action::Ignore => {},
    } Ok(())
}

#[tauri::command]
pub async fn telegram_stop(app: AppHandle) -> Result<(), String> {
    // Revoke local authority even if Telegram is unreachable.
    if let Some(stop) = app.state::<Telegram>().stop.lock().unwrap().take() { stop.store(true, Ordering::Relaxed); }
    *app.state::<Telegram>().config.lock().unwrap() = None;
    api("deleteWebhook", json!({"drop_pending_updates": true})).await?; Ok(())
}

#[tauri::command]
pub async fn telegram_request_approval(app: AppHandle, approval_id: String) -> Result<(), String> {
    let config = app.state::<Telegram>().config.lock().unwrap().clone().ok_or("Telegram is disabled")?;
    let info = app.state::<crate::approvals::ApprovalBook>().info(&approval_id)?;
    // Never interpolate model text, project titles, file paths, code, prompts or credentials.
    let policy = if info.risk == "high" { "High risk: Telegram approval records intent only. Native desktop confirmation is also required." } else { "Low risk: Zero may authorize exactly this staged revision remotely." };
    api("sendMessage", json!({"chat_id":config.chat_id,"text":format!("The Swarm: reviewed proposal ready. {} files. Revision {}. Project {}. Task {}. {} Review the desktop diff before deciding. Expires in 15 minutes.", info.paths.len(), info.id, info.project_id, info.task_id, policy),"reply_markup":{"inline_keyboard":[[{"text":"Review","callback_data":format!("review:{}",info.id)},{"text":if info.risk == "high" {"Approve intent"} else {"Approve & apply"},"callback_data":format!("approve:{}",info.id)},{"text":"Reject","callback_data":format!("reject:{}",info.id)}]]}})).await?; Ok(())
}

#[tauri::command]
pub async fn telegram_voice(app: AppHandle, id: String) -> Result<Vec<u8>, String> {
    let voice = app.state::<Telegram>().voices.lock().unwrap().iter().find(|v| v.id == id).cloned().ok_or("Unknown voice note")?;
    let value = api("getFile", json!({"file_id":voice.file_id})).await?;
    let path = value["file_path"].as_str().ok_or("Voice file not available")?;
    if path.contains("..") || path.contains(':') || path.starts_with('/') { return Err("Invalid voice file path".into()) }
    let token = token()?;
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(20)).build().map_err(|_| "Telegram unavailable")?;
    let response = client.get(format!("https://api.telegram.org/file/bot{token}/{path}")).send().await.map_err(|_| "Voice download failed")?;
    if !response.status().is_success() || response.content_length().unwrap_or(5_000_001) > 5_000_000 { return Err("Voice download rejected or too large".into()) }
    let data = response.bytes().await.map_err(|_| "Voice download failed")?;
    if data.len() > 5_000_000 { return Err("Voice note too large".into()) } Ok(data.to_vec())
}

#[tauri::command]
pub async fn telegram_send_voice(app: AppHandle, bytes: Vec<u8>, format: String) -> Result<(), String> {
    let config = app.state::<Telegram>().config.lock().unwrap().clone().ok_or("Telegram is disabled")?;
    if bytes.is_empty() || bytes.len() > 5_000_000 || !["ogg", "mp3", "m4a"].contains(&format.as_str()) { return Err("Use an OGG, MP3, or M4A voice note under 5 MB".into()) }
    if !app.dialog().message("Zero, send your selected voice note to your private Telegram chat? Keep it high-level; do not include secrets or raw code.").title("Send voice note").buttons(MessageDialogButtons::OkCancel).blocking_show() { return Err("Voice send cancelled".into()) }
    let token = token()?;
    let form = reqwest::multipart::Form::new().text("chat_id", config.chat_id.to_string()).part("voice", reqwest::multipart::Part::bytes(bytes).file_name(format!("voice.{format}")));
    let response = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(30)).build().map_err(|_| "Telegram unavailable")?.post(format!("https://api.telegram.org/bot{token}/sendVoice")).multipart(form).send().await.map_err(|_| "Voice upload failed")?;
    if !response.status().is_success() { return Err("Telegram rejected the voice note".into()) }
    let value: Value = response.json().await.map_err(|_| "Invalid Telegram response")?;
    if value["ok"] != true { return Err("Voice note was not accepted".into()) } Ok(())
}

#[cfg(test)] mod tests {
    use super::*;
    fn config() -> Config { Config { owner_id: 7, chat_id: 7, webhook_url: "https://example.test/telegram/webhook".into() } }
    fn callback(user: i64, chat: i64, data: &str) -> Vec<u8> { serde_json::to_vec(&json!({"update_id":1,"callback_query":{"id":"cb","from":{"id":user},"message":{"chat":{"id":chat,"type":"private"}},"data":data}})).unwrap() }
    #[test] fn requires_secret_and_owner_and_private_chat() { let b = callback(7,7,"approve:00000000-0000-4000-8000-000000000000"); assert!(validate(&config(),"secret","bad",&b).is_err()); assert!(validate(&config(),"secret","secret",&callback(8,7,"x")).is_err()); assert!(validate(&config(),"secret","secret",&callback(7,8,"x")).is_err()); assert!(validate(&config(),"secret","secret",&b).is_ok()); }
    #[test] fn rejects_malformed_or_oversize_updates() { assert!(validate(&config(),"s","s",b"{no").is_err()); assert!(validate(&config(),"s","s",&vec![b' '; MAX_BODY+1]).is_err()); assert!(validate(&config(),"s","s",&callback(7,7,"approve:arbitrary")).is_err()); }
    #[test] fn voice_and_text_never_grant_approval() { let v = serde_json::to_vec(&json!({"update_id":2,"message":{"from":{"id":7},"chat":{"id":7,"type":"private"},"text":"approve all changes"}})).unwrap(); assert_eq!(validate(&config(),"s","s",&v).unwrap().1,Action::Ignore); }
    #[test] fn review_callbacks_identify_a_proposal_without_approving_it() {
        let id="00000000-0000-4000-8000-000000000000";
        let (_,action)=validate(&config(),"s","s",&callback(7,7,&format!("review:{id}"))).unwrap();
        assert_eq!(action,Action::Review {id:id.into(),callback:"cb".into()});
        let mut group:Value=serde_json::from_slice(&callback(7,7,&format!("approve:{id}"))).unwrap();
        group["callback_query"]["message"]["chat"]["type"]="supergroup".into();
        assert!(validate(&config(),"s","s",&serde_json::to_vec(&group).unwrap()).is_err());
    }
}
