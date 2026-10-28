//! HTTP bridge for model providers.
//!
//! The webview never sees API keys: it names an environment variable and this
//! module reads it, attaches the auth header, and forwards the request. Streaming
//! responses are relayed chunk by chunk over a Tauri channel.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, State, AppHandle};


#[derive(Default)] pub struct ApiPolicy(AtomicBool);
#[tauri::command]
pub async fn set_api_policy(app: AppHandle, enabled: bool, policy: State<'_, ApiPolicy>) -> Result<(), String> {
    let _ = (app, policy);
    if enabled { return Err("Generic paid APIs are prohibited. DeepSeek is the sole permitted paid inference adapter and uses its own native controls.".into()) }
    Ok(())
}

#[derive(Default)]
pub struct Inflight(Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Deserialize)]
pub struct Auth {
    /// Name of the environment variable holding the secret.
    env: String,
    header: String,
    prefix: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRequest {
    id: String,
    url: String,
    method: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    auth: Option<Auth>,
    body: Option<String>,
}

#[derive(Serialize)]
pub struct ProviderResponse {
    status: u16,
    body: String,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        // Local models can pause for a long time while loading; this only trips on a dead socket.
        .read_timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())
}

fn build(req: &ProviderRequest, _allow_paid: bool) -> Result<reqwest::RequestBuilder, String> {
    let url = reqwest::Url::parse(&req.url).map_err(|e| format!("Invalid URL: {e}"))?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !local { return Err("External inference is blocked here. Use a signed-in CLI or the dedicated opt-in DeepSeek integration.".into()) }
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("Only http and https endpoints are allowed".into());
    }
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes())
        .map_err(|_| "Invalid HTTP method".to_string())?;
    let mut rb = client()?.request(method, url);
    for (k, v) in &req.headers {
        rb = rb.header(k, v);
    }
    if let Some(auth) = &req.auth {
        if auth.env == "DEEPSEEK_API_KEY" {return Err("DeepSeek credentials are restricted to the dedicated adapter".into())}
        if auth.env.starts_with("TELEGRAM_") { return Err("Telegram credentials are restricted to the Telegram integration".into()) }
        if !crate::secrets::valid_secret_name(&auth.env) {
            return Err(format!("'{}' is not an allowed key variable name (must end in KEY or TOKEN)", auth.env));
        }
        let secret = crate::secrets::lookup(&auth.env).ok_or_else(|| {
            format!("No API key found for {}. Add it on the Integrations page, or set it as an environment variable.", auth.env)
        })?;
        rb = rb.header(&auth.header, format!("{}{}", auth.prefix, secret));
    }
    if let Some(body) = &req.body {
        rb = rb.header("content-type", "application/json").body(body.clone());
    }
    Ok(rb)
}

fn trim(s: &str) -> String {
    s.chars().take(600).collect()
}

#[tauri::command]
pub async fn provider_request(req: ProviderRequest, policy: State<'_, ApiPolicy>) -> Result<ProviderResponse, String> {
    let resp = build(&req, policy.0.load(Ordering::Relaxed))?.send().await.map_err(|e| format!("Request failed: {e}"))?;
    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    Ok(ProviderResponse { status, body })
}

#[tauri::command]
pub async fn provider_stream(
    req: ProviderRequest,
    on_chunk: Channel<String>,
    state: State<'_, Inflight>,
    policy: State<'_, ApiPolicy>,
) -> Result<u16, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    state.0.lock().unwrap().insert(req.id.clone(), cancel.clone());

    let result = async {
        let resp = build(&req, policy.0.load(Ordering::Relaxed))?.send().await.map_err(|e| format!("Request failed: {e}"))?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("HTTP {}: {}", status.as_u16(), trim(&body)));
        }
        let mut stream = resp.bytes_stream();
        let mut carry: Vec<u8> = Vec::new();
        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            carry.extend_from_slice(&chunk.map_err(|e| format!("Stream error: {e}"))?);
            // Forward only complete UTF-8; keep a split multi-byte tail for the next chunk.
            let valid = match std::str::from_utf8(&carry) {
                Ok(s) => s.len(),
                Err(e) => e.valid_up_to(),
            };
            if valid > 0 {
                let text = String::from_utf8_lossy(&carry[..valid]).into_owned();
                carry.drain(..valid);
                on_chunk.send(text).map_err(|e| e.to_string())?;
            }
        }
        Ok(status.as_u16())
    }
    .await;

    state.0.lock().unwrap().remove(&req.id);
    result
}

#[tauri::command]
pub fn provider_cancel(id: String, state: State<'_, Inflight>) {
    if let Some(flag) = state.0.lock().unwrap().get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
}
