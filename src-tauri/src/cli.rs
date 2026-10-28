//! Fixed, proposal-only CLI adapters. No caller-supplied executable or command line.
use std::{collections::HashMap, io::{Read, Write}, path::{Path, PathBuf}, process::{Command, Stdio}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::{Duration, Instant}};
use serde::{Serialize,Deserialize};
use tauri::{AppHandle,Manager};
use tauri_plugin_dialog::{DialogExt,MessageDialogButtons};
use serde_json::Value;
use tauri::State;

#[derive(Default)]
pub struct CliRuns(Mutex<HashMap<String, (String,Arc<AtomicBool>)>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliResult { text: String, input_tokens: Option<u64>, output_tokens: Option<u64>, observed_model: Option<String> }

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
        return Ok(CliResult { text, input_tokens: input, output_tokens: out, observed_model: None })
    }
    let v: Value = serde_json::from_str(output).map_err(|_| "CLI returned an unsupported response. Update the CLI and reconnect.")?;
    if v["api_error"] == "usage_limit_reached" || v["api_error_status"] == 429 { return Err("Your subscription usage limit has been reached. Open the provider CLI for the reset time, then reconnect. No paid API fallback was used.".into()) }
    if v["is_error"] == true || !v["error"].is_null() { return Err("CLI authentication, quota, or request failed. Check its signed-in session. No paid API fallback was used.".into()) }
    let text = v["result"].as_str().or(v["response"].as_str()).filter(|s| !s.is_empty()).ok_or("CLI returned no response")?.to_string();
    Ok(CliResult { text, input_tokens: v["usage"]["input_tokens"].as_u64(), output_tokens: v["usage"]["output_tokens"].as_u64(), observed_model: v["model"].as_str().map(String::from) })
}

fn hide(command: &mut Command) {
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x0800_0000); }
}

fn run_cli_selected(provider: String, prompt: String, cancel: Arc<AtomicBool>, model: String, effort: Option<String>, timeout: u64) -> Result<CliResult, String> {
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
        let (program, mut args) = arguments(&provider, &policy)?;
        select_arguments(&provider, &mut args, &model, effort.as_deref())?;
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
            if cancel.load(Ordering::Relaxed) || overflow.load(Ordering::Relaxed) || start.elapsed() > Duration::from_secs(timeout.clamp(15,300)) {
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

fn select_arguments(provider:&str,args:&mut Vec<String>,model:&str,effort:Option<&str>)->Result<(),String>{
    if model.is_empty() || model.len()>96 || !model.bytes().all(|b|b.is_ascii_alphanumeric()||b"-_.:/".contains(&b)){return Err("Invalid model ID".into())}
    if model!="default" {
        let index=if provider=="codex"{args.len()-1}else{args.len()};
        args.splice(index..index,["--model".into(),model.into()]);
    }
    if let Some(e)=effort{
        if provider!="codex" || !["none","minimal","low","medium","high","xhigh","max","ultra"].contains(&e){return Err("Reasoning effort is not verified for this adapter".into())}
        args.splice(args.len()-1..args.len()-1,["-c".into(),format!("model_reasoning_effort=\"{e}\"")]);
    } Ok(())
}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct CatalogModel {pub id:String,pub label:String,pub efforts:Vec<String>,pub is_default:bool}
#[derive(Default)]pub struct Catalogs(Mutex<HashMap<String,Vec<CatalogModel>>>);
#[tauri::command]
pub async fn cli_models(app:AppHandle,provider:String)->Result<Vec<CatalogModel>,String>{
    let provider_copy=provider.clone();
    let rows=tauri::async_runtime::spawn_blocking(move||discover(&provider_copy)).await.map_err(|_|"Model discovery failed")??;
    app.state::<Catalogs>().0.lock().unwrap().insert(provider,rows.clone());Ok(rows)
}
fn discover(provider:&str)->Result<Vec<CatalogModel>,String>{
    use std::io::{BufRead,BufReader};
    if provider!="codex" && provider!="cursor-cli"{return Err("Supported dynamic model discovery is unavailable for this adapter. Keep the verified CLI default or use local model discovery; no inference probe was run.".into())}
    let mut command=Command::new(executable(if provider=="codex"{"codex"}else{"agent"})?);
    command.args(if provider=="codex"{vec!["app-server"]}else{vec!["--list-models"]}).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    for key in ["OPENAI_API_KEY","CODEX_API_KEY","OPENAI_BASE_URL","CURSOR_API_KEY"]{command.env_remove(key);}
    command.env("NO_COLOR","1");hide(&mut command);
    let mut child=command.spawn().map_err(|_|"Cannot start model discovery")?;
    let mut input=child.stdin.take().ok_or("Discovery input unavailable")?;
    if provider=="codex" { writeln!(input,"{}",serde_json::json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"swarm-model-control","version":"1.0"}}})).map_err(|_|"Discovery initialization failed")?; }
    let stdout=child.stdout.take().ok_or("Discovery output unavailable")?;
    let (tx,rx)=std::sync::mpsc::channel();
    std::thread::spawn(move||{for line in BufReader::new(stdout).lines().take(2000){if let Ok(line)=line{if line.len()>100_000||tx.send(line).is_err(){break}}else{break}}});
    let started=Instant::now();let mut rows=Vec::new();
    while started.elapsed()<Duration::from_secs(20){
        match rx.recv_timeout(Duration::from_millis(100)){
            Ok(line)=>{
                if provider=="codex" {
                    let Ok(v)=serde_json::from_str::<Value>(&line)else{continue};
                    if v["id"]==1 {let _=writeln!(input,"{{\"method\":\"initialized\",\"params\":{{}}}}");let _=writeln!(input,"{}",serde_json::json!({"id":2,"method":"model/list","params":{"limit":100,"includeHidden":false}}));}
                    if v["id"]==2 {if let Some(data)=v["result"]["data"].as_array(){for item in data{if let Some(id)=item["model"].as_str(){rows.push(CatalogModel{id:id.into(),label:item["displayName"].as_str().unwrap_or(id).into(),efforts:item["supportedReasoningEfforts"].as_array().map(|a|a.iter().filter_map(|e|e["reasoningEffort"].as_str().map(String::from)).collect()).unwrap_or_default(),is_default:item["isDefault"]==true});}}}break}
                }else{
                    // Cursor's documented text catalog. Only explicit model rows are admitted.
                    if let Some((id,label))=line.trim().split_once(" - "){if !id.is_empty()&&id.len()<96&&id.bytes().all(|b|b.is_ascii_alphanumeric()||b"-_.".contains(&b)){rows.push(CatalogModel{id:id.into(),label:label.into(),efforts:vec![],is_default:false});}}
                }
            },Err(std::sync::mpsc::RecvTimeoutError::Disconnected)=>break,Err(_)=>{}
        }
    }
    let _=child.kill();let _=child.wait();
    if rows.is_empty(){return Err("No supported model catalog returned. Update/sign in to the CLI; no model IDs or entitlements were invented.".into())}Ok(rows)
}
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct UsageRow{provider:String,model:String,run_id:String,at:u64,status:String,input_tokens:Option<u64>,output_tokens:Option<u64>}
fn ledger(app:&AppHandle)->Result<PathBuf,String>{Ok(app.path().app_data_dir().map_err(|_|"App data unavailable")?.join("subscription-usage.jsonl"))}
#[tauri::command]
pub fn cli_usage(app:AppHandle)->Result<Vec<UsageRow>,String>{
    let path=ledger(&app)?;if !path.exists(){return Ok(vec![])}
    Ok(std::fs::read_to_string(path).map_err(|_|"Cannot read usage ledger")?.lines().rev().take(2000).filter_map(|s|serde_json::from_str(s).ok()).collect())
}
fn append_usage(app:&AppHandle,row:&UsageRow)->Result<(),String>{let mut f=std::fs::OpenOptions::new().append(true).create(true).open(ledger(app)?).map_err(|_|"Usage ledger unavailable; no call launched")?;writeln!(f,"{}",serde_json::to_string(row).unwrap()).and_then(|_|f.sync_all()).map_err(|_|"Usage ledger commit failed".into())}
#[tauri::command]
pub async fn cli_chat(app:AppHandle,provider: String, request_id: String, prompt: String,model:Option<String>,effort:Option<String>,run_id:Option<String>,timeout_seconds:Option<u64>, state: State<'_, CliRuns>) -> Result<CliResult, String> {
    if prompt.len() > 250_000 { return Err("CLI prompt exceeds 250 KB".into()) }
    let model=model.unwrap_or_else(||"default".into());
    if model!="default" && !app.state::<Catalogs>().0.lock().unwrap().get(&provider).is_some_and(|rows|rows.iter().any(|m|m.id==model && effort.as_ref().is_none_or(|e|m.efforts.contains(e)))) {return Err("Requested model/effort is not in this session's verified catalog. Refresh Model Control; selection was not changed.".into())}
    if provider=="cursor-cli" {
        let allowed=app.path().app_data_dir().map_err(|_|"App data unavailable")?.join("cursor-included-models.json");
        let verified:Vec<String>=std::fs::read(allowed).ok().and_then(|s|serde_json::from_slice(&s).ok()).unwrap_or_default();
        if !verified.contains(&model){return Err("Cursor inference paused: confirm this exact model is included and on-demand billing is disabled using Model Control. No third-party billing was authorized.".into())}
    }
    let run=run_id.unwrap_or_else(||request_id.clone());let at=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    let flag = Arc::new(AtomicBool::new(false));
    { let mut runs = state.0.lock().unwrap(); if runs.len() >= 8 || runs.contains_key(&request_id) || runs.values().any(|(p,_)|p==&provider) { return Err("Provider concurrency is limited to one session. Wait in the provider queue.".into()) }
      let usage=cli_usage(app.clone())?;
      if usage.iter().filter(|u|u.status=="started"&&u.provider==provider&&u.at/86400==at/86400).count()>=40 || usage.iter().filter(|u|u.status=="started"&&u.run_id==run).count()>=8{return Err("Local usage guardian reached its daily or per-task call cap. Checkpoint retained; remaining provider allowance is unavailable.".into())}
      append_usage(&app,&UsageRow{provider:provider.clone(),model:model.clone(),run_id:run.clone(),at,status:"started".into(),input_tokens:None,output_tokens:None})?;
      runs.insert(request_id.clone(),(provider.clone(),flag.clone())); }
    let provider_copy=provider.clone();let model_copy=model.clone();
    let result = tauri::async_runtime::spawn_blocking(move || run_cli_selected(provider_copy,prompt,flag,model_copy,effort,timeout_seconds.unwrap_or(180))).await.map_err(|_|"CLI worker failed".to_string()).and_then(|r|r);
    state.0.lock().unwrap().remove(&request_id);
    append_usage(&app,&UsageRow{provider,model,run_id:run,at,status:if result.is_ok(){"completed"}else{"failed"}.into(),input_tokens:result.as_ref().ok().and_then(|r|r.input_tokens),output_tokens:result.as_ref().ok().and_then(|r|r.output_tokens)})?;
    result
}
#[tauri::command]
pub fn cli_cancel(request_id: String, state: State<'_, CliRuns>) { if let Some((_,flag)) = state.0.lock().unwrap().get(&request_id) { flag.store(true, Ordering::Relaxed); } }

#[tauri::command]
pub fn cli_confirm_included(app:AppHandle,model:String)->Result<(),String>{
    if !(model.starts_with("composer")||model.starts_with("grok")) || !app.state::<Catalogs>().0.lock().unwrap().get("cursor-cli").is_some_and(|r|r.iter().any(|m|m.id==model)){return Err("Only discovered Cursor-owned models may be confirmed. Auto and third-party models stay blocked.".into())}
    if !app.dialog().message(format!("Zero, confirm you checked your Cursor account: {model} is included in your existing plan, remaining included usage is sufficient, and on-demand/credit billing is disabled. The Swarm cannot verify your account billing settings automatically. This records user-configured entitlement, not live quota data. No account billing setting will be changed.")).title("Confirm included subscription usage").buttons(MessageDialogButtons::OkCancel).blocking_show(){return Err("Included usage not confirmed".into())}
    let path=app.path().app_data_dir().map_err(|_|"App data unavailable")?.join("cursor-included-models.json");
    std::fs::write(path,serde_json::to_vec(&vec![model]).unwrap()).map_err(|_|"Cannot save entitlement confirmation".into())
}

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
    #[test] fn scoped_models_preserve_safety_and_refuse_effort_for_unsupported_adapters(){
        let (_,mut args)=arguments("codex",Path::new("policy")).unwrap();select_arguments("codex",&mut args,"account-model",Some("low")).unwrap();assert!(args.windows(2).any(|w|w==["--model","account-model"]));assert!(args.contains(&"read-only".into()));assert_eq!(args.last().unwrap(),"-");assert!(select_arguments("cursor-cli",&mut vec![],"model",Some("high")).is_err());assert!(select_arguments("codex",&mut args,"model; shell",None).is_err());
    }
    #[test] #[ignore="Requires an installed signed-in Codex CLI; metadata only, no inference"]
    fn signed_in_catalog_discovery(){let rows=discover("codex").expect("real Codex catalog");assert!(!rows.is_empty());assert!(rows.iter().any(|m|m.is_default));println!("Verified {} models via official model/list; no inference requested",rows.len());}
    #[test] fn reads_real_usage() { let r = parse_result("codex", "{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"ok\"}}\n{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":42,\"output_tokens\":3}}").unwrap(); assert_eq!(r.input_tokens, Some(42)); }
    #[test] fn errors_never_count_as_success() { assert!(parse_result("claude-code", "{\"is_error\":true,\"result\":\"login required\"}").is_err()); assert!(parse_result("codex", "{}").is_err()); }
    #[test] #[ignore = "Uses signed-in subscriptions; explicitly opt in"]
    fn subscription_cli_smoke() {
        for provider in ["codex"] {
            let result = run_cli_selected(provider.into(), "Reply with only READY. Do not use tools.".into(), Arc::new(AtomicBool::new(false)),"default".into(),None,180).unwrap_or_else(|e| panic!("{provider}: {e}"));
            assert!(result.text.contains("READY"), "{provider} returned no readiness response");
        }
    }
    #[test] fn subscription_quota_is_actionable() { assert!(parse_result("claude-code", r#"{"is_error":true,"api_error_status":429,"api_error":"usage_limit_reached"}"#).err().unwrap().contains("subscription usage limit")); }
}
