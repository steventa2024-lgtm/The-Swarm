//! Immutable, expiring, single-use proposals. Approval authority is never an IPC flag.
use std::{collections::{HashMap, HashSet}, io::Write, path::Path, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use crate::fs::{approved_root, validate_proposal, write_approved, ApprovedRoots, WriteFile, WriteOutcome};

#[derive(Default)] pub struct ApprovalBook(Mutex<HashMap<String, Proposal>>);
#[derive(Clone)] struct Proposal { root: String, files: Vec<WriteFile>, info: ApprovalInfo }
#[derive(Clone, Serialize)] #[serde(rename_all = "camelCase")]
pub struct ApprovalInfo {
    pub id: String, pub run_id: String, pub project_id: String, pub task_id: String,
    pub paths: Vec<String>, pub expires_at: u64, pub status: String, pub risk: String, pub action: String,
}
#[derive(Clone, Serialize)] #[serde(rename_all = "camelCase")]
pub struct StagedProposal { pub info: ApprovalInfo, pub root: String, pub files: Vec<WriteFile> }
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }
#[tauri::command]
pub fn approval_pending(app:AppHandle)->Vec<ApprovalInfo>{app.state::<ApprovalBook>().pending()}
fn reference(value: Option<String>, fallback: &str) -> Result<String, String> {
    let value = value.unwrap_or_else(|| fallback.to_string());
    if value.is_empty() || value.len() > 100 || !value.bytes().all(|b| b.is_ascii_alphanumeric() || b"-_:".contains(&b)) { return Err("Approval context must use a bounded project/task identifier".into()) }
    Ok(value)
}

/// Unknown or executable content is high risk. Only plain documents and styles
/// are eligible for remote approval; markup always requires the desktop gate.
fn risk(files: &[WriteFile]) -> &'static str {
    if files.is_empty() { return "high" }
    for file in files {
        let path = file.path.replace('\\', "/").to_ascii_lowercase();
        let text = file.content.to_ascii_lowercase();
        let extension = Path::new(&path).extension().and_then(|s| s.to_str()).unwrap_or("");
        if path.split('/').any(|p| p.starts_with('.') || ["package.json", "package-lock.json", "cargo.toml", "cargo.lock", "dockerfile"].contains(&p))
            || ["secret", "credential", "private", "token", "config", "workflow"].iter().any(|s| path.contains(s))
            || (file.content.is_empty() && file.expected.as_ref().is_some_and(|s| !s.is_empty()))
            || !["md", "txt", "css"].contains(&extension) { return "high" }
        if ["<script", "javascript:", "<iframe", "<object", "<embed", "<form", "@import", "url(", "http://", "https://", "file://", "data:", "vbscript:"].iter().any(|s| text.contains(s)) { return "high" }
    }
    "low"
}

impl ApprovalBook {
    fn stage_context(&self, root: String, files: Vec<WriteFile>, run_id: String, project_id: String, task_id: String, probe: bool) -> Result<ApprovalInfo, String> {
        let mut book = self.0.lock().unwrap();
        // Superseding is scoped to the same project and run.
        book.retain(|_, p| p.info.expires_at > now() && !(p.info.run_id == run_id && p.info.project_id == project_id));
        if book.len() >= 20 { return Err("Too many pending approvals".into()) }
        let info = ApprovalInfo {
            id: uuid::Uuid::new_v4().to_string(), run_id, project_id, task_id,
            paths: files.iter().map(|f| f.path.clone()).collect(), expires_at: now() + 900,
            status: "pending".into(), risk: if probe { "low" } else { risk(&files) }.into(), action: if probe { "probe" } else { "files" }.into(),
        };
        book.insert(info.id.clone(), Proposal { root, files, info: info.clone() }); Ok(info)
    }
    pub(crate) fn info(&self, id: &str) -> Result<ApprovalInfo, String> {
        let book = self.0.lock().unwrap(); let p = book.get(id).ok_or("Approval is missing, already consumed, or was revoked by restart")?;
        if p.info.expires_at <= now() { return Err("Approval expired; review the proposal again".into()) }
        Ok(p.info.clone())
    }
    fn readback(&self, id: &str) -> Result<StagedProposal, String> {
        let book = self.0.lock().unwrap();
        let p = book.get(id).ok_or("Approval is missing, already consumed, or was revoked by restart")?;
        if p.info.expires_at <= now() { return Err("Approval expired; review the proposal again".into()) }
        Ok(StagedProposal { info: p.info.clone(), root: p.root.clone(), files: p.files.clone() })
    }
    pub(crate) fn pending(&self) -> Vec<ApprovalInfo> {
        self.0.lock().unwrap().values().filter(|p| p.info.expires_at > now()).map(|p| p.info.clone()).collect()
    }
    #[cfg(test)] fn consume(&self, id: &str) -> Result<Proposal, String> {
        let p = self.0.lock().unwrap().remove(id).ok_or("Approval already consumed or unknown")?;
        if p.info.expires_at <= now() { return Err("Approval expired".into()) } Ok(p)
    }
}

/// Local-only readback for presenting exactly the frozen revision referenced by a
/// Telegram Review button. This does not grant authority or consume the proposal.
#[tauri::command]
pub fn fs_get_staged(approval_id: String, book: State<'_, ApprovalBook>) -> Result<StagedProposal, String> { book.readback(&approval_id) }

#[tauri::command]
pub fn fs_stage(root: String, files: Vec<WriteFile>, run_id: String, review_passed: bool, project_id: Option<String>, task_id: Option<String>, roots: State<'_, ApprovedRoots>, book: State<'_, ApprovalBook>) -> Result<ApprovalInfo, String> {
    if !review_passed { return Err("Resolve reviewer issues before requesting owner approval".into()) }
    if files.is_empty() || files.len() > 60 || files.iter().map(|f| f.content.len()).sum::<usize>() > 8_000_000 { return Err("Proposal exceeds size limits or is empty".into()) }
    let canonical = approved_root(&roots, &root)?;
    let mut paths = HashSet::new();
    for file in &files {
        validate_proposal(&canonical, file)?;
        let target = crate::fs::join_rel(&canonical, &file.path)?.to_string_lossy().to_lowercase();
        if !paths.insert(target) { return Err("Duplicate file paths in proposal".into()) }
    }
    let project_id = reference(project_id, "local-project")?;
    let task_id = reference(task_id, &run_id)?;
    book.stage_context(canonical.to_string_lossy().into_owned(), files, run_id, project_id, task_id, false)
}

/// Harmless acknowledgement: immutable action with no file contents or writer call.
pub(crate) fn stage_probe(app: &AppHandle) -> Result<ApprovalInfo, String> {
    let id = uuid::Uuid::new_v4().to_string();
    app.state::<ApprovalBook>().stage_context(String::new(), vec![], format!("telegram-probe-{id}"), "telegram-activation".into(), format!("probe-{id}"), true)
}
fn audit_record(info: &ApprovalInfo, channel: &str, status: &str) -> serde_json::Value {
    serde_json::json!({ "id": info.id, "runId": info.run_id, "projectId": info.project_id, "taskId": info.task_id, "action": info.action, "risk": info.risk, "owner": "Zero", "channel": channel, "status": status, "at": now() })
}
fn append_audit(path: &Path, event: &serde_json::Value) -> Result<(), String> {
    let mut file = std::fs::OpenOptions::new().create(true).append(true).open(path).map_err(|_| "Owner audit unavailable. No new action may be applied.")?;
    writeln!(file, "{event}").and_then(|_| file.sync_all()).map_err(|_| "Could not persist owner audit. No new action may be applied.".into())
}
fn audit_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|_| "Owner audit directory unavailable")?;
    std::fs::create_dir_all(&dir).map_err(|_| "Owner audit directory unavailable")?;
    Ok(dir.join("owner-approvals.jsonl"))
}
fn emit_decision(app: &AppHandle, event: &serde_json::Value, outcomes: Option<&Vec<WriteOutcome>>) {
    let mut ui = event.clone();
    ui["outcomes"] = serde_json::to_value(outcomes).unwrap_or(serde_json::Value::Null);
    let _ = app.emit("swarm-approval", &ui);
}
fn remote_requires_desktop(info: &ApprovalInfo, approve: bool, channel: &str) -> bool {
    approve && channel != "desktop" && info.risk == "high" && info.action == "files"
}

fn decide(
    book: &ApprovalBook, id: &str, approve: bool, channel: &str,
    mut audit: impl FnMut(&serde_json::Value) -> Result<(), String>,
    write: impl FnOnce(Proposal) -> Result<Vec<WriteOutcome>, String>,
    emit: impl Fn(&serde_json::Value, Option<&Vec<WriteOutcome>>),
) -> Result<Vec<WriteOutcome>, String> {
    let info = book.info(id)?;
    if remote_requires_desktop(&info, approve, channel) {
        let mut guard = book.0.lock().unwrap();
        let proposal = guard.get_mut(id).ok_or("Approval already consumed or unknown")?;
        if proposal.info.expires_at <= now() { return Err("Approval expired".into()) }
        if proposal.info.status == "desktop_confirmation_required" { return Err("Desktop confirmation required. Your intent is already recorded; repeated callbacks grant no additional authority.".into()) }
        let event = audit_record(&proposal.info, channel, "desktop_confirmation_required");
        audit(&event)?;
        proposal.info.status = "desktop_confirmation_required".into();
        drop(guard);
        emit(&event, None);
        return Err("Desktop confirmation required. Zero's Telegram intent is recorded, and no files were written. Open this exact revision in The Swarm and confirm natively.".into())
    }
    // Sync authorization before calling a writer; mutex prevents dual-channel replay.
    let proposal = {
        let mut guard = book.0.lock().unwrap();
        let p = guard.get(id).ok_or("Approval already consumed or unknown")?;
        if p.info.expires_at <= now() { return Err("Approval expired".into()) }
        audit(&audit_record(&p.info, channel, if approve { "owner_authorized" } else { "rejected" }))?;
        guard.remove(id).unwrap()
    };
    let info = proposal.info.clone();
    let result = if !approve || info.action == "probe" { Ok(Vec::new()) } else { write(proposal) };
    let status = if !approve { "rejected" } else if info.action == "probe" { "approved_probe" } else if result.as_ref().is_ok_and(|rows| rows.iter().all(|r| r.ok)) { "applied" } else { "apply_failed" };
    let event = audit_record(&info, channel, status);
    let audited = audit(&event);
    emit(&event, result.as_ref().ok());
    // Synced owner_authorized evidence survives even a later outcome-log failure.
    audited.map_err(|_| "Owner authorization was recorded, but final outcome could not be logged. Inspect current files before staging again.".to_string())?;
    result
}

// Only a native human response or verified Telegram owner callback reaches here.
pub(crate) fn owner_decision(app: &AppHandle, id: &str, approve: bool, channel: &str) -> Result<Vec<WriteOutcome>, String> {
    let path = audit_path(app)?;
    decide(&app.state::<ApprovalBook>(), id, approve, channel,
        |event| append_audit(&path, event),
        |p| write_approved(p.root, p.files, &app.state::<ApprovedRoots>()),
        |event, outcomes| emit_decision(app, event, outcomes))
}

#[tauri::command]
pub async fn fs_apply(app: AppHandle, approval_id: String) -> Result<Vec<WriteOutcome>, String> {
    let info = app.state::<ApprovalBook>().info(&approval_id)?;
    let accepted = app.dialog().message(format!("Zero, approve this exact reviewed action?\nRevision: {}\nProject: {}\nTask: {}\nRun: {}\nRisk: {}\nAction: {}\nFiles:\n{}\n\nThis authorizes only the staged contents once. Cancel rejects the revision.", info.id, info.project_id, info.task_id, info.run_id, info.risk, info.action, info.paths.join("\n")))
        .title("The Swarm — owner approval required").buttons(MessageDialogButtons::OkCancel).blocking_show();
    let result = owner_decision(&app, &approval_id, accepted, "desktop")?;
    if !accepted { return Err("Zero rejected the proposal. No files were written.".into()) } Ok(result)
}

#[cfg(test)] mod tests {
    use super::*;
    fn stage(book: &ApprovalBook, project: &str, run: &str, file: WriteFile) -> ApprovalInfo { book.stage_context("root".into(), vec![file], run.into(), project.into(), "task".into(), false).unwrap() }
    fn file(path: &str, content: &str) -> WriteFile { WriteFile { path: path.into(), content: content.into(), expected: None } }
    #[test] fn proposals_are_immutable_and_consumed_once() { let book=ApprovalBook::default(); let mut input=file("a.txt","v1"); let i=stage(&book,"project","run",input.clone()); input.content="v2".into(); assert_eq!(book.consume(&i.id).unwrap().files[0].content,"v1"); assert!(book.consume(&i.id).is_err()); }
    #[test] fn staged_readback_is_a_detached_exact_revision_and_expires_with_authority() {
        let book=ApprovalBook::default(); let info=stage(&book,"project-one","run",file("a.txt","frozen content"));
        let mut copy=book.readback(&info.id).unwrap();
        assert_eq!(copy.info.project_id,"project-one"); assert_eq!(copy.root,"root");
        copy.files[0].content="edited UI copy".into(); copy.info.project_id="other-project".into();
        let exact=book.readback(&info.id).unwrap();
        assert_eq!(exact.files[0].content,"frozen content"); assert_eq!(exact.info.project_id,"project-one");
        book.0.lock().unwrap().get_mut(&info.id).unwrap().info.expires_at=0;
        assert!(book.readback(&info.id).is_err());
        let another=stage(&book,"project-one","another",file("a.txt","next"));
        book.consume(&another.id).unwrap(); assert!(book.readback(&another.id).is_err());
    }
    #[test] fn expiry_and_restart_revoke_authority() { let book=ApprovalBook::default(); let i=stage(&book,"p","run",file("a.txt","a")); book.0.lock().unwrap().get_mut(&i.id).unwrap().info.expires_at=0; assert!(book.consume(&i.id).is_err()); assert!(ApprovalBook::default().consume(&i.id).is_err()); }
    #[test] fn new_revision_revokes_same_project_and_run_but_not_another_project() { let book=ApprovalBook::default(); let old=stage(&book,"one","run",file("a.txt","old")); let other=stage(&book,"two","run",file("a.txt","other")); let new=stage(&book,"one","run",file("a.txt","new")); assert!(book.consume(&old.id).is_err()); assert_eq!(book.consume(&new.id).unwrap().info.project_id,"one"); assert_eq!(book.consume(&other.id).unwrap().files[0].content,"other"); }
    #[test] fn only_simple_static_content_is_eligible_for_remote_approval() { assert_eq!(risk(&[file("styles.css","body { color: white }")]),"low"); for f in [file("app.js","alert(1)"),file("index.html","<script>alert(1)</script>"),file("index.html","<img onerror='run()'>"),file("styles.css","@import 'remote'"),file(".env.txt","secret"),file("config/settings.md","value"),file("package.json","{}"),WriteFile {path:"a.txt".into(),content:String::new(),expected:Some("deleted".into())}] { assert_eq!(risk(&[f]),"high"); } }
    #[test] fn remote_intent_waits_for_desktop_and_cannot_apply_or_repeat() {
        use std::cell::{Cell,RefCell};
        let book=ApprovalBook::default(); let info=stage(&book,"p","r",file("app.js","x"));
        let writes=Cell::new(0); let events=RefCell::new(Vec::new());
        let remote=decide(&book,&info.id,true,"telegram",|e| {events.borrow_mut().push(e.clone()); Ok(())},|_| {writes.set(writes.get()+1); Ok(vec![])},|_,_| {});
        assert!(remote.err().unwrap().starts_with("Desktop confirmation required"));
        assert_eq!(writes.get(),0); assert_eq!(book.info(&info.id).unwrap().status,"desktop_confirmation_required");
        assert!(decide(&book,&info.id,true,"telegram",|_| panic!("duplicate intent must not be audited as new authority"),|_| panic!("remote must never write"),|_,_| {}).is_err());
        decide(&book,&info.id,true,"desktop",|e| {events.borrow_mut().push(e.clone()); Ok(())},|p| {assert_eq!(p.files[0].content,"x"); writes.set(writes.get()+1); Ok(vec![])},|_,_| {}).unwrap();
        assert_eq!(writes.get(),1); assert!(book.info(&info.id).is_err());
        assert_eq!(events.borrow()[0]["status"],"desktop_confirmation_required");
        assert_eq!(events.borrow()[1]["status"],"owner_authorized");
    }
    #[test] fn audit_failure_blocks_writes_and_keeps_revision_pending() {
        let book=ApprovalBook::default(); let info=stage(&book,"p","r",file("a.txt","text"));
        assert!(decide(&book,&info.id,true,"telegram",|_| Err("Disk full".into()),|_| panic!("no audit means no write"),|_,_| {}).is_err());
        assert!(book.info(&info.id).is_ok());
    }
    #[test] fn racing_callbacks_apply_a_revision_only_once() {
        use std::sync::{Arc,Barrier,atomic::{AtomicUsize,Ordering}};
        let book=Arc::new(ApprovalBook::default()); let info=stage(&book,"p","r",file("a.txt","text"));
        let barrier=Arc::new(Barrier::new(2)); let writes=Arc::new(AtomicUsize::new(0));
        let handles:Vec<_>=(0..2).map(|_| {let book=book.clone(); let id=info.id.clone(); let barrier=barrier.clone(); let writes=writes.clone(); std::thread::spawn(move || {barrier.wait(); decide(&book,&id,true,"telegram",|_| Ok(()),|_| {writes.fetch_add(1,Ordering::SeqCst); Ok(vec![])},|_,_| {}).is_ok()})}).collect();
        assert_eq!(handles.into_iter().map(|h| h.join().unwrap()).filter(|ok| *ok).count(),1);
        assert_eq!(writes.load(Ordering::SeqCst),1);
    }
    #[test] fn audit_excludes_contents_and_requires_durable_storage() { let book=ApprovalBook::default(); let info=stage(&book,"project","run",file("a.txt","PRIVATE_CONTENT")); let event=audit_record(&info,"telegram","owner_authorized"); let text=event.to_string(); assert!(!text.contains("PRIVATE_CONTENT")); assert!(!text.contains("a.txt")); assert!(text.contains("project")); let dir=std::env::temp_dir().join(format!("swarm-audit-{}",uuid::Uuid::new_v4())); assert!(append_audit(&dir.join("missing/owner.jsonl"),&event).is_err()); std::fs::create_dir_all(&dir).unwrap(); let path=dir.join("owner.jsonl"); append_audit(&path,&event).unwrap(); let saved=std::fs::read_to_string(path).unwrap(); assert_eq!(serde_json::from_str::<serde_json::Value>(saved.trim()).unwrap(),event); std::fs::remove_dir_all(dir).unwrap(); }
    #[test] fn probe_is_bound_to_harmless_action_not_file_contents() { let book=ApprovalBook::default(); let i=book.stage_context(String::new(),vec![],"probe-run".into(),"activation".into(),"probe-task".into(),true).unwrap(); let p=book.consume(&i.id).unwrap(); assert_eq!(p.info.action,"probe"); assert_eq!(p.info.risk,"low"); assert!(p.files.is_empty()); assert!(p.root.is_empty()); assert!(book.consume(&i.id).is_err()); }
    #[test] fn changed_files_cannot_be_overwritten() { let dir=std::env::temp_dir().join(format!("swarm-approval-test-{}",uuid::Uuid::new_v4())); std::fs::create_dir_all(&dir).unwrap(); let root=dunce::canonicalize(&dir).unwrap(); std::fs::write(root.join("a.txt"),"new user edit").unwrap(); assert!(validate_proposal(&root,&WriteFile {path:"a.txt".into(),content:"agent".into(),expected:Some("old".into())}).is_err()); std::fs::remove_dir_all(dir).unwrap(); }
}
