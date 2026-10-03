//! Serves generated files to the in-app preview iframe.
//!
//! A loopback-only HTTP server on a random port, keyed by an unguessable token.
//! Files exist only in memory. The frontend embeds the URL in a sandboxed iframe
//! (no `allow-same-origin`), and every response carries a CSP that lets the page
//! load scripts/styles from common CDNs but blocks it from making network
//! requests of its own.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock},
};

use serde::{Deserialize, Serialize};
use tiny_http::{Header, Response, Server};

type Sites = Arc<Mutex<HashMap<String, HashMap<String, Vec<u8>>>>>;

struct Preview {
    port: u16,
    sites: Sites,
}

static PREVIEW: OnceLock<Result<Preview, String>> = OnceLock::new();

const CSP: &str = "default-src 'none'; \
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://cdn.tailwindcss.com; \
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com; \
    font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; \
    img-src 'self' data: blob: https:; media-src 'self' data: blob:; connect-src 'self' https://esm.sh; \
    base-uri 'none'; form-action 'none'";

fn content_type(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "txt" | "md" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).unwrap()
}

fn start() -> Result<Preview, String> {
    let server = Server::http("127.0.0.1:0").map_err(|e| format!("Preview server failed to start: {e}"))?;
    let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("Preview server has no port")?;
    let sites: Sites = Arc::new(Mutex::new(HashMap::new()));
    let shared = sites.clone();
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            // URL shape: /<token>/<path...>
            let url = req.url().split(['?', '#']).next().unwrap_or("/").to_string();
            let mut parts = url.trim_start_matches('/').splitn(2, '/');
            let token = parts.next().unwrap_or("");
            let rest = parts.next().unwrap_or("");
            let rel = if rest.is_empty() { "index.html" } else { rest };
            let body = shared.lock().unwrap().get(token).and_then(|files| files.get(rel).cloned());
            let _ = match body {
                Some(bytes) => req.respond(
                    Response::from_data(bytes)
                        .with_header(header("Content-Type", content_type(rel)))
                        .with_header(header("Content-Security-Policy", CSP))
                        .with_header(header("X-Content-Type-Options", "nosniff"))
                        .with_header(header("Cache-Control", "no-store"))
                        .with_header(header("Referrer-Policy", "no-referrer")),
                ),
                None => req.respond(Response::from_string("Not found").with_status_code(404)),
            };
        }
    });
    Ok(Preview { port, sites })
}

fn preview() -> Result<&'static Preview, String> {
    PREVIEW.get_or_init(start).as_ref().map_err(|e| e.clone())
}

#[derive(Deserialize)]
pub struct PreviewFile {
    path: String,
    content: String,
}

#[derive(Serialize)]
pub struct Published {
    token: String,
    /// Base URL ending in `/`; append the entry path.
    base: String,
}

fn clean(path: &str) -> Option<String> {
    let p = path.trim().replace('\\', "/");
    let p = p.trim_start_matches("./");
    if p.is_empty() || p.starts_with('/') || p.contains("..") || p.contains(':') || p.len() > 240 {
        return None;
    }
    Some(p.to_string())
}

/// Replaces the files of a preview site (creating it on first use) and returns its URL.
#[tauri::command]
pub fn preview_publish(files: Vec<PreviewFile>, token: Option<String>) -> Result<Published, String> {
    let pv = preview()?;
    if files.len() > 300 || files.iter().map(|f| f.content.len()).sum::<usize>() > 20_000_000 {
        return Err("Preview is too large".into());
    }
    let mut site = HashMap::new();
    for f in files {
        if let Some(p) = clean(&f.path) {
            site.insert(p, f.content.into_bytes());
        }
    }
    let token = token
        .filter(|t| pv.sites.lock().unwrap().contains_key(t))
        .unwrap_or_else(|| uuid::Uuid::new_v4().simple().to_string());
    pv.sites.lock().unwrap().insert(token.clone(), site);
    Ok(Published { base: format!("http://127.0.0.1:{}/{}/", pv.port, token), token })
}

#[tauri::command]
pub fn preview_clear(token: String) {
    if let Ok(pv) = preview() {
        pv.sites.lock().unwrap().remove(&token);
    }
}
