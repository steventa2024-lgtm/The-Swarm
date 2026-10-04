//! Runs a project's own checks (tests, type-check, lint, build) so the team's output
//! is judged by real results instead of a model's opinion.
//!
//! Safety model: the webview never supplies a command line. It picks an `id` from
//! what `detect_checks` found (npm scripts by name, cargo, pytest, a JS syntax check),
//! the folder must be one the user approved, and each run has a timeout and can be
//! cancelled. Note that an npm script is whatever the project's package.json says —
//! the UI shows that text before the user presses Run.

use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::{ipc::Channel, State};

use crate::fs::{approved_root, ApprovedRoots, SKIP_DIRS};

const NPM_SCRIPTS: &[&str] = &["test", "typecheck", "lint", "build", "check"];
const TIMEOUT: Duration = Duration::from_secs(180);
/// Live output beyond this is dropped from the stream (the tail is still kept for the result).
const MAX_STREAM: usize = 400_000;
const KEEP_TAIL: usize = 60_000;

#[derive(Default)]
pub struct RunningChecks(Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Serialize)]
pub struct CheckInfo {
    id: String,
    label: String,
    /// What will actually run, shown to the user before they press Run.
    command: String,
    note: Option<String>,
}

#[derive(Serialize)]
pub struct CheckResult {
    ok: bool,
    exit_code: Option<i32>,
    timed_out: bool,
    cancelled: bool,
    duration_ms: u64,
    /// The last part of the combined output.
    output: String,
}

fn js_files(root: &Path) -> Vec<String> {
    fn walk(dir: &Path, root: &Path, depth: usize, out: &mut Vec<String>) {
        if depth > 3 || out.len() >= 60 {
            return;
        }
        let Ok(rd) = fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            let name = e.file_name().to_string_lossy().into_owned();
            if ft.is_dir() {
                if !SKIP_DIRS.contains(&name.as_str()) {
                    walk(&e.path(), root, depth + 1, out);
                }
            } else if [".js", ".mjs", ".cjs"].iter().any(|x| name.ends_with(x)) {
                if let Ok(rel) = e.path().strip_prefix(root) {
                    out.push(rel.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
    let mut out = Vec::new();
    walk(root, root, 0, &mut out);
    out.sort();
    out
}

fn npm_scripts(root: &Path) -> HashMap<String, String> {
    fs::read_to_string(root.join("package.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("scripts").and_then(|s| s.as_object()).cloned())
        .map(|m| m.into_iter().filter_map(|(k, v)| v.as_str().map(|s| (k, s.to_string()))).collect())
        .unwrap_or_default()
}

fn has_python_tests(root: &Path) -> bool {
    if root.join("pytest.ini").is_file() || root.join("conftest.py").is_file() {
        return true;
    }
    let tests = root.join("tests");
    root.join("pyproject.toml").is_file()
        && tests.is_dir()
        && fs::read_dir(tests).map(|rd| rd.flatten().any(|e| e.file_name().to_string_lossy().ends_with(".py"))).unwrap_or(false)
}

fn detect(root: &Path) -> Vec<CheckInfo> {
    let mut out = Vec::new();
    let scripts = npm_scripts(root);
    let installed = root.join("node_modules").is_dir();
    for name in NPM_SCRIPTS {
        if let Some(cmd) = scripts.get(*name) {
            out.push(CheckInfo {
                id: format!("npm:{name}"),
                label: format!("npm run {name}"),
                command: cmd.clone(),
                note: (!installed).then(|| "Dependencies aren't installed (no node_modules). Run `npm install` in the folder first.".to_string()),
            });
        }
    }
    if root.join("Cargo.toml").is_file() {
        for sub in ["check", "test"] {
            out.push(CheckInfo { id: format!("cargo:{sub}"), label: format!("cargo {sub}"), command: format!("cargo {sub}"), note: None });
        }
    }
    if has_python_tests(root) {
        out.push(CheckInfo { id: "py:pytest".into(), label: "pytest".into(), command: "python -m pytest -q".into(), note: None });
    }
    if !js_files(root).is_empty() {
        out.push(CheckInfo {
            id: "js:syntax".into(),
            label: "JavaScript syntax check".into(),
            command: "node --check <each .js file>".into(),
            note: None,
        });
    }
    out
}

#[tauri::command]
pub fn detect_checks(root: String, state: State<'_, ApprovedRoots>) -> Result<Vec<CheckInfo>, String> {
    let root = approved_root(&state, &root)?;
    Ok(detect(&root))
}

#[tauri::command]
pub fn cancel_check(run_id: String, state: State<'_, RunningChecks>) {
    if let Some(flag) = state.0.lock().unwrap().get(&run_id) {
        flag.store(true, Ordering::Relaxed);
    }
}

fn base_command(program: &str, args: &[&str], cwd: &Path) -> Command {
    let mut c = Command::new(program);
    c.args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Run once and exit: most test runners switch to a non-watch mode under CI.
        .env("CI", "1")
        .env("NO_COLOR", "1")
        .env("FORCE_COLOR", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    c
}

#[cfg(windows)]
const NPM: &str = "npm.cmd";
#[cfg(not(windows))]
const NPM: &str = "npm";

fn kill_tree(child: &mut Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // npm.cmd starts node as a grandchild; killing only the parent would leave it running.
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .creation_flags(0x0800_0000)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
}

struct Outcome {
    exit_code: Option<i32>,
    timed_out: bool,
    cancelled: bool,
    output: String,
}

fn keep_tail(buf: &mut String) {
    if buf.len() > KEEP_TAIL * 2 {
        let mut cut = buf.len() - KEEP_TAIL;
        while !buf.is_char_boundary(cut) {
            cut += 1;
        }
        buf.drain(..cut);
    }
}

/// Runs one process to completion, streaming output, honouring the deadline and cancel flag.
fn run_process(mut cmd: Command, deadline: Instant, cancel: &AtomicBool, sink: &Channel<String>, sent: &Arc<AtomicUsize>) -> Result<Outcome, String> {
    let mut child = cmd.spawn().map_err(|e| format!("Could not start the command: {e}. Is it installed and on your PATH?"))?;
    let tail = Arc::new(Mutex::new(String::new()));

    let mut readers = Vec::new();
    for stream in [child.stdout.take().map(|s| Box::new(s) as Box<dyn Read + Send>), child.stderr.take().map(|s| Box::new(s) as Box<dyn Read + Send>)]
        .into_iter()
        .flatten()
    {
        let tail = tail.clone();
        let sink = sink.clone();
        let sent = sent.clone();
        readers.push(std::thread::spawn(move || {
            let mut s = stream;
            let mut buf = [0u8; 4096];
            while let Ok(n) = s.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let text = String::from_utf8_lossy(&buf[..n]).into_owned();
                {
                    let mut t = tail.lock().unwrap();
                    t.push_str(&text);
                    keep_tail(&mut t);
                }
                if sent.fetch_add(n, Ordering::Relaxed) < MAX_STREAM {
                    let _ = sink.send(text);
                }
            }
        }));
    }

    let (mut timed_out, mut cancelled) = (false, false);
    let status = loop {
        match child.try_wait() {
            Ok(Some(st)) => break Some(st),
            Ok(None) => {}
            Err(e) => return Err(e.to_string()),
        }
        if cancel.load(Ordering::Relaxed) {
            cancelled = true;
        } else if Instant::now() >= deadline {
            timed_out = true;
        }
        if cancelled || timed_out {
            kill_tree(&mut child);
            break child.wait().ok();
        }
        std::thread::sleep(Duration::from_millis(40));
    };
    for r in readers {
        let _ = r.join();
    }
    let output = tail.lock().unwrap().clone();
    Ok(Outcome { exit_code: status.and_then(|s| s.code()), timed_out, cancelled, output })
}

fn run_by_id(root: &Path, id: &str, cancel: &AtomicBool, sink: &Channel<String>) -> Result<CheckResult, String> {
    let started = Instant::now();
    let deadline = started + TIMEOUT;
    let sent = Arc::new(AtomicUsize::new(0));
    let (kind, name) = id.split_once(':').ok_or("Unknown check")?;

    let outcome = match kind {
        "npm" => {
            if !NPM_SCRIPTS.contains(&name) || !npm_scripts(root).contains_key(name) {
                return Err(format!("This project has no '{name}' script"));
            }
            run_process(base_command(NPM, &["run", name], root), deadline, cancel, sink, &sent)?
        }
        "cargo" => {
            if !["check", "test"].contains(&name) || !root.join("Cargo.toml").is_file() {
                return Err("Not a Cargo project".into());
            }
            run_process(base_command("cargo", &[name, "--color", "never"], root), deadline, cancel, sink, &sent)?
        }
        "py" if name == "pytest" => run_process(base_command("python", &["-m", "pytest", "-q"], root), deadline, cancel, sink, &sent)?,
        "js" if name == "syntax" => {
            let files = js_files(root);
            if files.is_empty() {
                return Err("No JavaScript files found".into());
            }
            let mut all = String::new();
            let (mut worst, mut timed_out, mut cancelled) = (Some(0), false, false);
            for f in &files {
                let o = run_process(base_command("node", &["--check", f], root), deadline, cancel, sink, &sent)?;
                let line = if o.exit_code == Some(0) { format!("ok   {f}\n") } else { format!("FAIL {f}\n{}\n", o.output.trim_end()) };
                let _ = sink.send(line.clone());
                all.push_str(&line);
                if o.exit_code != Some(0) {
                    worst = o.exit_code.or(Some(1));
                }
                timed_out |= o.timed_out;
                cancelled |= o.cancelled;
                if timed_out || cancelled {
                    break;
                }
            }
            Outcome { exit_code: worst, timed_out, cancelled, output: all }
        }
        _ => return Err("Unknown check".into()),
    };

    Ok(CheckResult {
        ok: outcome.exit_code == Some(0) && !outcome.timed_out && !outcome.cancelled,
        exit_code: outcome.exit_code,
        timed_out: outcome.timed_out,
        cancelled: outcome.cancelled,
        duration_ms: started.elapsed().as_millis() as u64,
        output: outcome.output,
    })
}

#[tauri::command]
pub async fn run_check(
    root: String,
    id: String,
    run_id: String,
    on_output: Channel<String>,
    approved: State<'_, ApprovedRoots>,
    running: State<'_, RunningChecks>,
) -> Result<CheckResult, String> {
    let root: PathBuf = approved_root(&approved, &root)?;
    let cancel = Arc::new(AtomicBool::new(false));
    running.0.lock().unwrap().insert(run_id.clone(), cancel.clone());

    let flag = cancel.clone();
    let res = tauri::async_runtime::spawn_blocking(move || run_by_id(&root, &id, &flag, &on_output))
        .await
        .map_err(|e| e.to_string())?;

    running.0.lock().unwrap().remove(&run_id);
    res
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("zp-checks-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn detects_npm_scripts_by_allowlist_only() {
        let d = temp("npm");
        fs::write(d.join("package.json"), r#"{"scripts":{"test":"vitest run","build":"vite build","deploy":"rm -rf /","start":"node ."}}"#).unwrap();
        let ids: Vec<String> = detect(&d).into_iter().map(|c| c.id).collect();
        assert_eq!(ids, vec!["npm:test", "npm:build"]); // 'deploy' and 'start' are never offered
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn warns_when_dependencies_are_missing() {
        let d = temp("nodeps");
        fs::write(d.join("package.json"), r#"{"scripts":{"test":"x"}}"#).unwrap();
        assert!(detect(&d)[0].note.is_some());
        fs::create_dir_all(d.join("node_modules")).unwrap();
        assert!(detect(&d)[0].note.is_none());
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn detects_cargo_python_and_js_syntax() {
        let d = temp("multi");
        fs::write(d.join("Cargo.toml"), "[package]\nname=\"x\"").unwrap();
        fs::write(d.join("app.js"), "let a = 1").unwrap();
        fs::create_dir_all(d.join("node_modules/dep")).unwrap();
        fs::write(d.join("node_modules/dep/skip.js"), "x").unwrap();
        let ids: Vec<String> = detect(&d).into_iter().map(|c| c.id).collect();
        assert!(ids.contains(&"cargo:check".to_string()) && ids.contains(&"cargo:test".to_string()));
        assert!(ids.contains(&"js:syntax".to_string()));
        assert_eq!(js_files(&d), vec!["app.js"]); // node_modules is skipped
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn nothing_detected_in_an_empty_folder() {
        let d = temp("empty");
        assert!(detect(&d).is_empty());
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn tail_is_bounded_and_char_safe() {
        let mut s = "é".repeat(KEEP_TAIL * 3);
        keep_tail(&mut s);
        assert!(s.len() <= KEEP_TAIL * 2 + 4);
        assert!(s.is_char_boundary(0));
    }
}
