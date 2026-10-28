//! The only separately metered inference path. No endpoint, headers, tools or
//! credentials are supplied by the renderer. Budget reservations survive crashes.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
const KEY: &str = "DEEPSEEK_API_KEY";
const BASE: &str = "https://api.deepseek.com";
const PRICE_SOURCE: &str = "https://api-docs.deepseek.com/quick_start/pricing/";
// Peak cache-miss rates verified 2026-10-28; expired snapshots fail closed.
const PRICE_EXPIRY: u64 = 1793750400;
#[derive(Default)]
pub struct DeepSeek {
    enabled: AtomicBool,
    balance_available: AtomicBool,
    cancel: AtomicBool,
    busy: AtomicBool,
    models: Mutex<Vec<String>>,
    projects: Mutex<HashSet<String>>,
    failures: Mutex<u8>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Ledger {
    day: u64,
    reserved_micros: u64,
    calls: u32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    key_present: bool,
    enabled: bool,
    busy: bool,
    models: Vec<String>,
    approved_projects: Vec<String>,
    reserved_usd: f64,
    daily_limit_usd: f64,
    calls: u32,
    price_source: &'static str,
    price_verified: &'static str,
    circuit_open: bool,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn ledger_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "App data unavailable")?
        .join("deepseek-budget.json"))
}
fn load(app: &AppHandle) -> Result<Ledger, String> {
    let path = ledger_path(app)?;
    let mut l: Ledger = if path.exists() {
        serde_json::from_slice(&std::fs::read(path).map_err(|_| "Cannot read budget ledger")?)
            .map_err(|_| "Budget ledger damaged; paid use blocked")?
    } else {
        Ledger::default()
    };
    let today = now() / 86400;
    if today > l.day {
        l = Ledger {
            day: today,
            ..Ledger::default()
        }
    } else if today < l.day {
        return Err("Clock moved backwards; paid inference is blocked".into());
    }
    Ok(l)
}
fn persist(app: &AppHandle, l: &Ledger) -> Result<(), String> {
    use std::io::Write;
    let path = ledger_path(app)?;
    let tmp = path.with_extension("tmp");
    let mut f = std::fs::File::create(&tmp).map_err(|_| "Cannot reserve budget")?;
    f.write_all(&serde_json::to_vec(l).unwrap())
        .and_then(|_| f.sync_all())
        .map_err(|_| "Cannot commit budget reservation")?;
    std::fs::rename(tmp, path).map_err(|_| "Cannot commit budget ledger".into())
}
fn reserve(
    l: &mut Ledger,
    model: &str,
    input_bytes: usize,
    output: u32,
    pro: bool,
    limit: u64,
) -> Result<u64, String> {
    if !["deepseek-flash", "deepseek-v4-pro"].contains(&model) || model == "deepseek-v4-pro" && !pro
    {
        return Err(
            "Model unavailable or Pro has not been explicitly authorized; no substitution".into(),
        );
    }
    if input_bytes > 32_000 || output == 0 || output > 4096 || l.calls >= 40 {
        return Err("DeepSeek context, output or daily request cap reached".into());
    }
    let (i, o) = if model == "deepseek-flash" {
        (30u64, 120u64)
    } else {
        (132, 396)
    };
    // UTF-8 byte bound plus framing, peak prices, 2x safety margin. No cache discount.
    let cost = (((input_bytes as u64 + 2048) * i + output as u64 * o) * 2 + 99) / 100;
    if l.reserved_micros.saturating_add(cost) > limit {
        return Err("DeepSeek daily reservation limit reached. No new call launched".into());
    }
    l.reserved_micros += cost;
    l.calls += 1;
    Ok(cost)
}
fn daily_limit(app: &AppHandle) -> Result<u64, String> {
    let p = ledger_path(app)?.with_file_name("deepseek-daily-limit.json");
    if !p.exists() {
        return Ok(500_000);
    }
    let n: u64 = serde_json::from_slice(&std::fs::read(p).map_err(|_| "Cannot read paid limit")?)
        .map_err(|_| "Invalid paid limit")?;
    if !(10_000..=5_000_000).contains(&n) {
        return Err("Paid limit outside supported bounds".into());
    }
    Ok(n)
}
#[tauri::command]
pub fn deepseek_set_daily_limit(app: AppHandle, usd: f64) -> Result<(), String> {
    if !usd.is_finite() || !(0.01..=5.0).contains(&usd) {
        return Err("Daily limit must be $0.01 to $5.00".into());
    }
    let n = (usd * 1_000_000.0).round() as u64;
    if !app.dialog().message(format!("Zero, change the strict DeepSeek daily reservation limit to ${usd:.2}? This changes only the app guard, not provider billing or account funds. Current reservations remain counted.")).title("Paid inference limit").buttons(MessageDialogButtons::OkCancel).blocking_show(){return Err("Limit unchanged".into())}
    std::fs::write(
        ledger_path(&app)?.with_file_name("deepseek-daily-limit.json"),
        serde_json::to_vec(&n).unwrap(),
    )
    .map_err(|_| "Cannot save limit".into())
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|_| "DeepSeek transport unavailable".into())
}
async fn metadata(path: &str) -> Result<Value, String> {
    let key = crate::secrets::credential_only(KEY)
        .ok_or("DeepSeek is not configured. Use the native masked key dialog.")?;
    let r = client()?
        .get(format!("{BASE}{path}"))
        .bearer_auth(key)
        .send()
        .await
        .map_err(|_| "DeepSeek metadata request failed; balance unavailable")?;
    if !r.status().is_success() {
        return Err(format!(
            "DeepSeek metadata HTTP {}. No inference was requested.",
            r.status().as_u16()
        ));
    }
    use futures_util::StreamExt;
    let mut stream = r.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(part) = stream.next().await {
        let part = part.map_err(|_| "Metadata unavailable")?;
        if bytes.len() + part.len() > 1_000_000 {
            return Err("Metadata exceeded bounds".into());
        }
        bytes.extend_from_slice(&part);
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid DeepSeek metadata".into())
}
#[tauri::command]
pub fn deepseek_status(app: AppHandle) -> Result<Status, String> {
    let state = app.state::<DeepSeek>();
    let l = load(&app)?;
    let result = Ok(Status {
        key_present: crate::secrets::credential_only(KEY).is_some(),
        enabled: state.enabled.load(Ordering::Relaxed),
        busy: state.busy.load(Ordering::Relaxed),
        models: state.models.lock().unwrap().clone(),
        approved_projects: state.projects.lock().unwrap().iter().cloned().collect(),
        reserved_usd: l.reserved_micros as f64 / 1_000_000.0,
        daily_limit_usd: daily_limit(&app)? as f64 / 1_000_000.0,
        calls: l.calls,
        price_source: PRICE_SOURCE,
        price_verified: "2026-10-28 · peak prices, 2x reserve",
        circuit_open: *state.failures.lock().unwrap() >= 3,
    });
    result
}
#[tauri::command]
pub async fn deepseek_test(app: AppHandle) -> Result<Value, String> {
    let models = metadata("/models").await?;
    let ids: Vec<String> = models["data"]
        .as_array()
        .ok_or("Invalid model list")?
        .iter()
        .filter_map(|m| m["id"].as_str())
        .filter(|id| ["deepseek-flash", "deepseek-v4-pro"].contains(id))
        .map(String::from)
        .collect();
    app.state::<DeepSeek>()
        .models
        .lock()
        .unwrap()
        .clone_from(&ids);
    let balance = metadata("/user/balance").await;
    app.state::<DeepSeek>().balance_available.store(
        balance.as_ref().is_ok_and(|v| v["is_available"] == true),
        Ordering::Relaxed,
    );
    Ok(
        json!({"models":ids,"balance":balance.as_ref().ok(),"balanceError":balance.as_ref().err(),"inferenceRequested":false}),
    )
}
#[tauri::command]
pub fn deepseek_cancel(app: AppHandle) {
    app.state::<DeepSeek>()
        .cancel
        .store(true, Ordering::Relaxed);
}
#[tauri::command]
pub fn deepseek_disable(app: AppHandle) {
    let s = app.state::<DeepSeek>();
    s.enabled.store(false, Ordering::Relaxed);
    s.projects.lock().unwrap().clear();
}
#[tauri::command]
pub fn deepseek_delete(app: AppHandle) -> Result<(), String> {
    deepseek_disable(app.clone());
    crate::secrets::delete_dedicated(KEY)
}
#[tauri::command]
pub fn deepseek_allow_project(
    app: AppHandle,
    project_id: String,
    root: String,
) -> Result<(), String> {
    crate::fs::approved_root(&app.state::<crate::fs::ApprovedRoots>(), &root)?;
    if project_id.len() > 96 {
        return Err("Invalid project".into());
    }
    if !app.dialog().message("Zero, allow this approved project's task text and relevant source context to leave your machine for api.deepseek.com? Paid inference still requires its separate session authorization. TradeAI remains paper-only; tool execution and paid search are disabled.").title("Project cloud egress").buttons(MessageDialogButtons::OkCancel).blocking_show(){return Err("Cloud egress declined".into())}
    app.state::<DeepSeek>()
        .projects
        .lock()
        .unwrap()
        .insert(project_id);
    Ok(())
}
#[tauri::command]
pub fn deepseek_enable(app: AppHandle) -> Result<(), String> {
    let s = app.state::<DeepSeek>();
    if crate::secrets::credential_only(KEY).is_none()
        || s.models.lock().unwrap().is_empty()
        || !s.balance_available.load(Ordering::Relaxed)
    {
        return Err("Save a key and obtain a positive provider balance and model check first. No paid call was made.".into());
    }
    if now() > PRICE_EXPIRY {
        return Err(
            "Price snapshot expired. Reverify official peak prices before enabling paid use."
                .into(),
        );
    }
    if !app.dialog().message(format!("Zero, authorize chargeable DeepSeek inference for this app session, only for projects you separately approve? Strict cap: ${:.2}/UTC day, 40 calls/day, 32 KB input, 4096 output tokens, one concurrent request. Peak pricing has a 2x safety reserve. In-flight work may still bill; app controls do not replace provider account spending limits. No top-ups, paid search or automatic Pro escalation.",daily_limit(&app)? as f64/1_000_000.0)).title("Authorize paid DeepSeek session").buttons(MessageDialogButtons::OkCancel).blocking_show(){return Err("DeepSeek remains off".into())}
    s.enabled.store(true, Ordering::Relaxed);
    Ok(())
}
#[derive(Deserialize, Serialize)]
pub struct Message {
    role: String,
    content: String,
}
#[tauri::command]
pub async fn deepseek_chat(
    app: AppHandle,
    project_id: String,
    model: String,
    messages: Vec<Message>,
    max_tokens: u32,
    pro_approved: Option<bool>,
    on_chunk: tauri::ipc::Channel<String>,
) -> Result<Value, String> {
    let s = app.state::<DeepSeek>();
    if !s.enabled.load(Ordering::Relaxed)
        || !s.balance_available.load(Ordering::Relaxed)
        || !s.projects.lock().unwrap().contains(&project_id)
    {
        return Err(
            "DeepSeek disabled or this project has no native cloud-egress permission".into(),
        );
    }
    if now() > PRICE_EXPIRY || *s.failures.lock().unwrap() >= 3 {
        return Err(
            "DeepSeek pricing expired or circuit breaker open; disable and inspect before new work"
                .into(),
        );
    }
    if !s.models.lock().unwrap().contains(&model) {
        return Err("Exact model absent from authenticated list; no substitution".into());
    }
    // Pro intent from the renderer cannot confer native authority.
    let _ = pro_approved;
    let pro = if model == "deepseek-v4-pro" {
        if !app.dialog().message("Zero, authorize this exact bounded DeepSeek Pro request? It is chargeable at the higher Pro price, within your daily reservation cap. No automatic escalation or paid tools are enabled.").title("Approve one DeepSeek Pro request").buttons(MessageDialogButtons::OkCancel).blocking_show(){return Err("Pro request declined".into())}
        true
    } else {
        false
    };
    if messages.is_empty()
        || messages.len() > 20
        || messages
            .iter()
            .any(|m| !["system", "user", "assistant"].contains(&m.role.as_str()))
    {
        return Err("Invalid bounded message schema".into());
    }
    let key = crate::secrets::credential_only(KEY).ok_or("DeepSeek key unavailable")?;
    if s.busy.swap(true, Ordering::SeqCst) {
        return Err("DeepSeek concurrency cap: one request".into());
    }
    s.cancel.store(false, Ordering::Relaxed);
    let result=async{
        let mut l=load(&app)?;reserve(&mut l,&model,messages.iter().map(|m|m.content.len()).sum(),max_tokens,pro,daily_limit(&app)?)?;persist(&app,&l)?;
        let response=client()?.post(format!("{BASE}/chat/completions")).bearer_auth(key).json(&json!({"model":model,"messages":messages,"max_tokens":max_tokens,"thinking":{"type":"disabled"},"stream":true,"stream_options":{"include_usage":true}})).send().await.map_err(|_|"DeepSeek request interrupted. Reservation retained because in-flight usage may bill.")?;
        if !response.status().is_success(){return Err(format!("DeepSeek HTTP {}. No response body or secrets logged; reservation retained.",response.status().as_u16()))}
        use futures_util::StreamExt;
        let mut network=response.bytes_stream();let mut stream=crate::deepseek_stream::Stream::default();
        while let Some(part)=network.next().await {
            if s.cancel.load(Ordering::Relaxed)||!s.enabled.load(Ordering::Relaxed){return Err("DeepSeek cancelled. In-flight billing may apply; reservation retained.".into())}
            for delta in stream.push(&part.map_err(|_|"DeepSeek stream interrupted")?)? {let _=on_chunk.send(delta);}
        }
        stream.finish()

    }.await;
    s.busy.store(false, Ordering::SeqCst);
    if result.is_err() {
        *s.failures.lock().unwrap() += 1
    }
    result
}

#[tauri::command]
pub fn deepseek_key_dialog(app: AppHandle) -> Result<(), String> {
    deepseek_disable(app.clone());
    #[cfg(windows)]
    {
        #[repr(C)]
        struct Info {
            size: u32,
            parent: isize,
            message: *const u16,
            caption: *const u16,
            banner: isize,
        }
        #[link(name = "credui")]
        extern "system" {
            fn CredUIPromptForCredentialsW(
                info: *const Info,
                target: *const u16,
                reserved: isize,
                error: u32,
                user: *mut u16,
                user_max: u32,
                password: *mut u16,
                password_max: u32,
                save: *mut i32,
                flags: u32,
            ) -> u32;
        }
        let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
        let message=wide("Enter your DeepSeek API key in the password field. Stored only in the OS vault; never sent to the WebView. Saving does not enable paid inference.");
        let caption = wide("The Swarm - DeepSeek secure key entry");
        let target = wide("ZeroPulse Swarm DeepSeek");
        let mut user = [0u16; 256];
        for (i, c) in "DeepSeek".encode_utf16().enumerate() {
            user[i] = c;
        }
        let mut password = [0u16; 1024];
        let mut save = 0;
        let parent = app
            .get_webview_window("main")
            .and_then(|w| w.hwnd().ok())
            .map(|h| h.0 as isize)
            .unwrap_or(0);
        let info = Info {
            size: std::mem::size_of::<Info>() as u32,
            parent,
            message: message.as_ptr(),
            caption: caption.as_ptr(),
            banner: 0,
        };
        let result = unsafe {
            CredUIPromptForCredentialsW(
                &info,
                target.as_ptr(),
                0,
                0,
                user.as_mut_ptr(),
                256,
                password.as_mut_ptr(),
                1024,
                &mut save,
                0x40000 | 0x2 | 0x80 | 0x8,
            )
        };
        let end = password
            .iter()
            .position(|c| *c == 0)
            .unwrap_or(password.len());
        let mut key = String::from_utf16(&password[..end]).map_err(|_| "Invalid credential")?;
        for c in &mut password {
            unsafe { std::ptr::write_volatile(c, 0) }
        }
        let saved = if result != 0 {
            Err("Native key entry cancelled".into())
        } else if key.len() < 10 || key.len() > 1000 || key.chars().any(char::is_control) {
            Err("Invalid key format".into())
        } else {
            crate::secrets::store_dedicated(KEY, &key)
        };
        unsafe { key.as_bytes_mut().fill(0) }
        saved
    }
    #[cfg(not(windows))]
    {
        Err("Native masked entry has been implemented for Windows. macOS secure entry remains manual/unverified; no renderer key field is provided.".into())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn strict_reservation_survives_unknown_usage() {
        let mut l = Ledger::default();
        let first = reserve(&mut l, "deepseek-flash", 32000, 4096, false, 500_000).unwrap();
        assert!(first > 0);
        for _ in 0..40 {
            let _ = reserve(&mut l, "deepseek-flash", 32000, 4096, false, 500_000);
        }
        assert!(l.reserved_micros <= 500000);
        assert!(reserve(&mut l, "deepseek-flash", 32000, 4096, false, 500_000).is_err());
    }
    #[test]
    fn prohibits_aliases_pro_escalation_and_unbounded_context() {
        for name in ["deepseek-chat", "deepseek-v4-pro", "other"] {
            assert!(reserve(&mut Ledger::default(), name, 10, 100, false, 500_000).is_err())
        }
        assert!(reserve(
            &mut Ledger::default(),
            "deepseek-flash",
            32001,
            100,
            false,
            500_000
        )
        .is_err());
    }
    #[test]
    fn mocked_response_preserves_actual_model_and_usage() {
        let v:Value=serde_json::from_str(r#"{"model":"deepseek-flash","choices":[{"message":{"content":"proposal"}}],"usage":{"prompt_tokens":10,"completion_tokens":20}}"#).unwrap();
        assert_eq!(v["usage"]["prompt_tokens"], 10);
        assert_eq!(v["model"], "deepseek-flash");
    }
}
