//! API keys live in the OS credential store (Windows Credential Manager), never
//! in app state or on disk in plain text. The webview can store, check and delete
//! a key but can never read one back: only `provider.rs` reads them, to attach an
//! auth header.

use keyring::v1::Entry;
use serde::Serialize;

const SERVICE: &str = "ZeroPulse Swarm";

/// Only `*_KEY` / `*_TOKEN` style names are accepted, so this can't be used as a
/// general-purpose secret or environment reader.
pub fn valid_secret_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
        && name.chars().next().is_some_and(|c| c.is_ascii_uppercase())
        && (name.ends_with("KEY") || name.ends_with("TOKEN"))
}

fn entry(name: &str) -> Result<Entry, String> {
    if !valid_secret_name(name) {
        return Err(format!("'{name}' is not an allowed key name (must end in KEY or TOKEN)"));
    }
    Entry::new(SERVICE, name).map_err(|e| format!("Credential store unavailable: {e}"))
}

/// Keychain first, then the process environment. Used by the provider bridge.
pub fn lookup(name: &str) -> Option<String> {
    if !valid_secret_name(name) {
        return None;
    }
    entry(name)
        .ok()
        .and_then(|e| e.get_password().ok())
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var(name).ok().filter(|s| !s.is_empty()))
}

#[derive(Serialize)]
pub struct SecretStatus {
    /// "keychain", "env" or "none"
    source: &'static str,
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("The key is empty".into());
    }
    if value.len() > 2000 || value.chars().any(|c| c.is_control()) {
        return Err("That doesn't look like an API key".into());
    }
    entry(&name)?.set_password(value).map_err(|e| format!("Could not save the key: {e}"))
}

#[tauri::command]
pub fn secret_status(name: String) -> Result<SecretStatus, String> {
    if entry(&name).ok().and_then(|e| e.get_password().ok()).is_some_and(|s| !s.is_empty()) {
        return Ok(SecretStatus { source: "keychain" });
    }
    if std::env::var(&name).is_ok_and(|s| !s.is_empty()) {
        return Ok(SecretStatus { source: "env" });
    }
    Ok(SecretStatus { source: "none" })
}

#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::v1::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not remove the key: {e}")),
    }
}
