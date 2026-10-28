//! Fixed, proposal-only CLI adapters. No caller-supplied executable or command line.
use std::{collections::HashMap, io::{Read, Write}, path::{Path, PathBuf}, process::{Command, Stdio}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::{Duration, Instant}};
use serde::Serialize;
use serde_json::Value;
use tauri::State;

#[derive(Default)]
pub struct CliRuns(Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliResult { text: String, input_tokens: Option<u64>, output_tokens: Option<u64> }

const CURSOR_POLICY: &str = r#"{"permissions":{"allow":[],"deny":["Shell(*)","Write(**)","Write(/**)","Write(*:/**)","Read(**)","Read(/**)","Read(*:/**)","WebFetch(*)","Mcp(*:*)"]}}"#;

fn arguments(provider: &str, policy: &Path) -> Result<(&'static str, Vec<String>), String> {
    let (program, args) = match provider {
        "codex" => ("codex", vec!["exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check", "--json", "-c", "forced_login_method=\"chatgpt\"", "-c", "approval_policy=\"never\"", "--disable", "shell_tool", "--disable", "apply_patch_freeform", "-c", "mcp_servers={}", "-"]),
        "claude-code" => ("claude", vec!["-p", "--safe-mode", "--tools", "", "--disallowedTools", "mcp__*", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json"]),
        "gemini-cli" => ("gemini", vec!["--prompt", "Follow the request on stdin. Return proposed text only.", "--output-format", "json", "--approval-mode", "plan", "--policy", policy.to_str().ok_or("Invalid policy path")?]),
        "cursor-cli" => ("agent", vec!["--trust", "--print", "--mode", "ask", "--output-format", "json"]),
        _ => return Err("Unsupported CLI. Grok has no verified subscription adapter; paid API fallback is disabled.".into()),
    };
    Ok((program, args.into_iter().map(String::from).collect()))
}

fn executable(name: &str) -> Result<PathBuf, String> {
    let paths = std::env::var_os("PATH").unwrap_or_default();
    for dir in std::env::split_paths(&paths) {
        // Windows npm launchers get only fixed arguments; prompt data travels over stdin.
        for suffix in if cfg!(windows) { vec![".exe", ".cmd"] } else { vec![""] } {
            let p = dir.join(format!("{name}{suffix}"));
            if p.is_file() { return Ok(p) }
        }
    }
    Err(format!("{name} CLI not installed or not on PATH. Install it and sign in with your subscription. No API fallback was used."))
}

fn parse_result(provider: &str, output: &str) -> Result<CliResult, String> {
    if provider == "codex" {
        let mut text = String::new(); let mut input = None; let mut out = None;
        for line in output.lines() {
            let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
            if v["type"] == "error" || v["type"] == "turn.failed" { return Err("Codex request failed. Check ChatGPT login, plan quota, and CLI compatibility. No API fallback was used.".into()) }
            if v["type"] == "item.completed" && v["item"]["type"] == "agent_message" { text = v["item"]["text"].as_str().unwrap_or_default().to_string(); }
            if v["type"] == "turn.completed" { input = v["usage"]["input_tokens"].as_u64(); out = v["usage"]["output_tokens"].as_u64(); }
        }
        if text.is_empty() { return Err("Codex returned no completed response. Check CLI sign-in and version.".into()) }
        return Ok(CliResult { text, input_tokens: input, output_tokens: out })
    }
    let v: Value = serde_json::from_str(output).map_err(|_| "CLI returned an unsupported response. Update the CLI and reconnect.")?;
    if v["api_error"] == "usage_limit_reached" || v["api_error_status"] == 429 { return Err("Your subscription usage limit has been reached. Open the provider CLI for the reset time, then reconnect. No paid API fallback was used.".into()) }
    if v["is_error"] == true || !v["error"].is_null() { return Err("CLI authentication, quota, or request failed. Check its signed-in session. No paid API fallback was used.".into()) }
    let text = v["result"].as_str().or(v["response"].as_str()).filter(|s| !s.is_empty()).ok_or("CLI returned no response")?.to_string();
    Ok(CliResult { text, input_tokens: v["usage"]["input_tokens"].as_u64(), output_tokens: v["usage"]["output_tokens"].as_u64() })
}

fn hide(command: &mut Command) {
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x0800_0000); }
}

fn run_cli(provider: String, prompt: String, cancel: Arc<AtomicBool>) -> Result<CliResult, String> {
    let dir = std::env::temp_dir().join(format!("swarm-cli-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let policy = dir.join("deny-tools.toml");
    std::fs::write(&policy, "[[rule]]\ntoolName = \"*\"\ndecision = \"deny\"\npriority = 999\n").map_err(|e| e.to_string())?;
    let result = (|| {
        if provider == "claude-code" {
            let mut status = Command::new(executable("claude")?);
            status.args(["auth", "status"]).current_dir(&dir);
            for key in ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"] { status.env_remove(key); }
            hide(&mut status);
            let response = status.output().map_err(|_| "Cannot verify Claude subscription login")?;
            let auth: Value = serde_json::from_slice(&response.stdout).map_err(|_| "Update Claude Code: auth status JSON is required")?;
            if !response.status.success() || auth["loggedIn"] != true || auth["authMethod"] != "claude.ai" || auth["subscriptionType"].as_str().is_none() { return Err("Claude Code must be signed in with an eligible Claude subscription. API-key authentication is disabled here.".into()) }
        }
        if provider == "gemini-cli" {
            std::fs::create_dir_all(dir.join(".gemini")).map_err(|e| e.to_string())?;
            std::fs::write(dir.join(".gemini/settings.json"), r#"{"security":{"auth":{"selectedType":"oauth-personal"}},"hooks":{"disabled":true}}"#).map_err(|e| e.to_string())?;
        }
        if provider == "cursor-cli" {
            std::fs::create_dir_all(dir.join(".cursor")).map_err(|e| e.to_string())?;
            std::fs::write(dir.join(".cursor/cli.json"), CURSOR_POLICY).map_err(|e| e.to_string())?;
        }
        let (program, args) = arguments(&provider, &policy)?;
        let mut command = Command::new(executable(program)?);
        command.args(args).current_dir(&dir).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        for key in ["OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENAI_USE_VERTEXAI", "CURSOR_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_TOKEN"] { command.env_remove(key); }
        command.env("NO_COLOR", "1"); hide(&mut command);
        if cancel.load(Ordering::Relaxed) { return Err("Cancelled".into()) }
        let mut child = command.spawn().map_err(|_| format!("Could not start {program}. Check installation and version."))?;
        let mut stdin = child.stdin.take().ok_or("CLI stdin unavailable")?;
        let input = std::thread::spawn(move || { let _ = stdin.write_all(prompt.as_bytes()); });
        let stdout = child.stdout.take().ok_or("CLI stdout unavailable")?;
        let stderr = child.stderr.take().ok_or("CLI stderr unavailable")?;
        let overflow = Arc::new(AtomicBool::new(false));
        let read = |mut pipe: Box<dyn Read + Send>, flag: Arc<AtomicBool>| std::thread::spawn(move || {
            let mut out = Vec::new(); let mut buf = [0; 8192];
            while let Ok(n) = pipe.read(&mut buf) { if n == 0 { break } if out.len() + n > 2_000_000 { flag.store(true, Ordering::Relaxed); break } out.extend_from_slice(&buf[..n]); }
            String::from_utf8_lossy(&out).into_owned()
        });
        let output = read(Box::new(stdout), overflow.clone()); let errors = read(Box::new(stderr), overflow.clone());
        let start = Instant::now();
        let status = loop {
            if cancel.load(Ordering::Relaxed) || overflow.load(Ordering::Relaxed) || start.elapsed() > Duration::from_secs(300) {
                #[cfg(windows)] { let mut kill = Command::new("taskkill"); kill.args(["/PID", &child.id().to_string(), "/T", "/F"]); hide(&mut kill); let _ = kill.status(); }
                let _ = child.kill(); let _ = child.wait();
                return Err("CLI cancelled, timed out, or exceeded output limit. No files were applied.".into())
            }
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? { break status }
            std::thread::sleep(Duration::from_millis(50));
        };
        let _ = input.join(); let text = output.join().unwrap_or_default(); let _ = errors.join();
        if !status.success() {
            if let Err(e) = parse_result(&provider, &text) { if e.contains("usage limit") { return Err(e) } }
            return Err(format!("{program} exited unsuccessfully. Check subscription login, quota, and required safety flags with {program} --help. No paid API fallback was used."))
        }
        parse_result(&provider, &text)
    })();
    // Only the fresh UUID-named temporary directory created above is removed.
    let _ = std::fs::remove_dir_all(&dir);
    result
}

#[tauri::command]
pub async fn cli_chat(provider: String, request_id: String, prompt: String, state: State<'_, CliRuns>) -> Result<CliResult, String> {
    if prompt.len() > 250_000 { return Err("CLI prompt exceeds 250 KB".into()) }
    let flag = Arc::new(AtomicBool::new(false));
    { let mut runs = state.0.lock().unwrap(); if runs.len() >= 8 || runs.contains_key(&request_id) { return Err("CLI concurrency limit or duplicate request ID".into()) } runs.insert(request_id.clone(), flag.clone()); }
    let result = tauri::async_runtime::spawn_blocking(move || run_cli(provider, prompt, flag)).await.map_err(|e| e.to_string()).and_then(|r| r);
    state.0.lock().unwrap().remove(&request_id); result
}
#[tauri::command]
pub fn cli_cancel(request_id: String, state: State<'_, CliRuns>) { if let Some(flag) = state.0.lock().unwrap().get(&request_id) { flag.store(true, Ordering::Relaxed); } }

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn rejects_arbitrary_programs() { assert!(arguments("powershell", Path::new("policy")).is_err()); }
    #[test] fn safety_flags_are_fixed() { let (_, a) = arguments("codex", Path::new("policy")).unwrap(); assert!(a.contains(&"read-only".into())); assert!(!a.contains(&"--full-auto".into())); let (_, c) = arguments("claude-code", Path::new("policy")).unwrap(); assert!(c.windows(2).any(|w| w == ["--tools", ""])); }
    #[test] fn cursor_trust_preserves_proposal_only_guards() {
        let (program, args) = arguments("cursor-cli", Path::new("policy")).unwrap();
        assert_eq!(program, "agent");
        assert!(args.contains(&"--trust".into()));
        assert!(args.windows(2).any(|w| w == ["--mode", "ask"]));
        for unsafe_flag in ["--force", "-f", "--yolo", "--approve-mcps"] {
            assert!(!args.iter().any(|arg| arg == unsafe_flag));
        }
        let policy: Value = serde_json::from_str(CURSOR_POLICY).unwrap();
        assert!(policy["permissions"]["allow"].as_array().unwrap().is_empty());
        for denied in ["Shell(*)", "Write(**)", "Read(**)", "WebFetch(*)", "Mcp(*:*)"] {
            assert!(policy["permissions"]["deny"].as_array().unwrap().iter().any(|rule| rule == denied));
        }
    }
    #[test] fn reads_real_usage() { let r = parse_result("codex", "{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"ok\"}}\n{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":42,\"output_tokens\":3}}").unwrap(); assert_eq!(r.input_tokens, Some(42)); }
    #[test] fn errors_never_count_as_success() { assert!(parse_result("claude-code", "{\"is_error\":true,\"result\":\"login required\"}").is_err()); assert!(parse_result("codex", "{}").is_err()); }
    #[test] #[ignore = "Uses signed-in subscriptions; explicitly opt in"]
    fn subscription_cli_smoke() {
        for provider in ["codex"] {
            let result = run_cli(provider.into(), "Reply with only READY. Do not use tools.".into(), Arc::new(AtomicBool::new(false))).unwrap_or_else(|e| panic!("{provider}: {e}"));
            assert!(result.text.contains("READY"), "{provider} returned no readiness response");
        }
    }
    #[test] fn subscription_quota_is_actionable() { assert!(parse_result("claude-code", r#"{"is_error":true,"api_error_status":429,"api_error":"usage_limit_reached"}"#).err().unwrap().contains("subscription usage limit")); }
}
