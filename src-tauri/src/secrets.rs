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
        && name
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
        && name.chars().next().is_some_and(|c| c.is_ascii_uppercase())
        && (name.ends_with("KEY") || name.ends_with("TOKEN"))
}

fn entry(name: &str) -> Result<Entry, String> {
    if !valid_secret_name(name) {
        return Err(format!(
            "'{name}' is not an allowed key name (must end in KEY or TOKEN)"
        ));
    }
    Entry::new(SERVICE, name).map_err(|e| format!("Credential store unavailable: {e}"))
}

pub(crate) fn managed_telegram_name(name: &str) -> bool {
    [
        "HQ", "CODEX", "CLAUDE", "GEMINI", "CURSOR", "GROK", "OLLAMA",
    ]
    .iter()
    .any(|id| name == format!("TELEGRAM_BOT_{id}_TOKEN"))
}

/// Managed Telegram tokens deliberately have no environment-variable fallback.
pub(crate) fn credential_only(name: &str) -> Option<String> {
    entry(name)
        .ok()?
        .get_password()
        .ok()
        .filter(|value| !value.is_empty())
}
pub(crate) fn store_managed(name: &str, value: &str) -> Result<(), String> {
    if !managed_telegram_name(name) {
        return Err("Unknown managed Telegram credential".into());
    }
    entry(name)?
        .set_password(value)
        .map_err(|_| "Windows Credential Manager could not save the token".into())
}
pub(crate) fn remove_managed(name: &str) -> Result<(), String> {
    if !managed_telegram_name(name) {
        return Err("Unknown managed Telegram credential".into());
    }
    match entry(name)?.delete_credential() {
        Ok(()) | Err(keyring::v1::Error::NoEntry) => Ok(()),
        Err(_) => Err("Windows Credential Manager could not remove the token".into()),
    }
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
    if managed_telegram_name(&name) {
        return Err(
            "Use Telegram Bots to replace managed tokens and revoke their active sessions".into(),
        );
    }
    let value = value.trim();
    if value.is_empty() {
        return Err("The key is empty".into());
    }
    if value.len() > 2000 || value.chars().any(|c| c.is_control()) {
        return Err("That doesn't look like an API key".into());
    }
    entry(&name)?
        .set_password(value)
        .map_err(|e| format!("Could not save the key: {e}"))
}

#[tauri::command]
pub fn secret_status(name: String) -> Result<SecretStatus, String> {
    if entry(&name)
        .ok()
        .and_then(|e| e.get_password().ok())
        .is_some_and(|s| !s.is_empty())
    {
        return Ok(SecretStatus { source: "keychain" });
    }
    if std::env::var(&name).is_ok_and(|s| !s.is_empty()) {
        return Ok(SecretStatus { source: "env" });
    }
    Ok(SecretStatus { source: "none" })
}

#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    if managed_telegram_name(&name) {
        return Err("Use Telegram Bots to revoke a managed token and its receiver".into());
    }
    match entry(&name)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::v1::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not remove the key: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn managed_tokens_cannot_bypass_receiver_revocation_through_generic_commands() {
        assert!(
            secret_set("TELEGRAM_BOT_HQ_TOKEN".into(), "not-a-real-token".into())
                .unwrap_err()
                .contains("Telegram Bots")
        );
        assert!(secret_delete("TELEGRAM_BOT_HQ_TOKEN".into())
            .unwrap_err()
            .contains("Telegram Bots"));
        assert!(!managed_telegram_name("TELEGRAM_BOT_TOKEN"));
    }
}
