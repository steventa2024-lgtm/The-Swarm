//! Immutable, expiring, single-use proposals. No agent or IPC argument grants approval.
use std::{collections::{HashMap, HashSet}, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use crate::fs::{approved_root, validate_proposal, write_approved, ApprovedRoots, WriteFile, WriteOutcome};

#[derive(Default)] pub struct ApprovalBook(Mutex<HashMap<String, Proposal>>);
#[derive(Clone)] struct Proposal { root: String, files: Vec<WriteFile>, info: ApprovalInfo }
#[derive(Clone, Serialize)] #[serde(rename_all = "camelCase")]
pub struct ApprovalInfo { pub id: String, pub run_id: String, pub paths: Vec<String>, pub expires_at: u64, pub status: String }
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }

impl ApprovalBook {
    fn stage(&self, root: String, files: Vec<WriteFile>, run_id: String) -> Result<ApprovalInfo, String> {
        let mut book = self.0.lock().unwrap();
        book.retain(|_, p| p.info.expires_at > now() && p.info.status == "pending" && p.info.run_id != run_id);
        if book.len() >= 20 { return Err("Too many pending approvals".into()) }
        let info = ApprovalInfo { id: uuid::Uuid::new_v4().to_string(), run_id, paths: files.iter().map(|f| f.path.clone()).collect(), expires_at: now() + 900, status: "pending".into() };
        book.insert(info.id.clone(), Proposal { root, files, info: info.clone() }); Ok(info)
    }
    pub(crate) fn info(&self, id: &str) -> Result<ApprovalInfo, String> {
        let book = self.0.lock().unwrap(); let p = book.get(id).ok_or("Approval is missing, already consumed, or was revoked by restart")?;
        if p.info.expires_at <= now() { return Err("Approval expired; review the proposal again".into()) }
        Ok(p.info.clone())
    }
    fn consume(&self, id: &str) -> Result<Proposal, String> {
        let p = self.0.lock().unwrap().remove(id).ok_or("Approval already consumed or unknown")?;
        if p.info.expires_at <= now() { return Err("Approval expired".into()) } Ok(p)
    }
}

#[tauri::command]
pub fn fs_stage(root: String, files: Vec<WriteFile>, run_id: String, review_passed: bool, roots: State<'_, ApprovedRoots>, book: State<'_, ApprovalBook>) -> Result<ApprovalInfo, String> {
    if !review_passed { return Err("Resolve reviewer issues before requesting owner approval".into()) }
    if files.is_empty() || files.len() > 60 || files.iter().map(|f| f.content.len()).sum::<usize>() > 8_000_000 { return Err("Proposal exceeds size limits or is empty".into()) }
    let canonical = approved_root(&roots, &root)?;
    let mut paths = HashSet::new();
    for file in &files {
        validate_proposal(&canonical, file)?;
        let target = crate::fs::join_rel(&canonical, &file.path)?.to_string_lossy().to_lowercase();
        if !paths.insert(target) { return Err("Duplicate file paths in proposal".into()) }
    }
    book.stage(canonical.to_string_lossy().into_owned(), files, run_id)
}

// Called only after a native human response or a verified Telegram owner callback.
pub(crate) fn owner_decision(app: &AppHandle, id: &str, approve: bool, channel: &str) -> Result<Vec<WriteOutcome>, String> {
    let proposal = app.state::<ApprovalBook>().consume(id)?;
    let result = if approve { write_approved(proposal.root, proposal.files, &app.state::<ApprovedRoots>()) } else { Ok(Vec::new()) };
    let status = if !approve { "rejected" } else if result.as_ref().is_ok_and(|rows| rows.iter().all(|r| r.ok)) { "applied" } else { "apply_failed" };
    // Audit contains identifiers and outcomes only; proposed code and secrets never enter it.
    let event = serde_json::json!({ "id": id, "runId": proposal.info.run_id, "owner": "Zero", "channel": channel, "status": status, "at": now() });
    use tauri::Emitter;
    // Native UI receives per-file outcomes for the existing verification panel.
    // They are not sent to Telegram or copied into the minimal on-disk audit.
    let mut ui_event = event.clone();
    ui_event["outcomes"] = serde_json::to_value(result.as_ref().ok()).unwrap_or(serde_json::Value::Null);
    let _ = app.emit("swarm-approval", &ui_event);
    if let Ok(dir) = app.path().app_data_dir() {
        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("owner-approvals.jsonl")) { let _ = writeln!(file, "{event}"); }
    }
    result
}

#[tauri::command]
pub async fn fs_apply(app: AppHandle, approval_id: String) -> Result<Vec<WriteOutcome>, String> {
    let info = app.state::<ApprovalBook>().info(&approval_id)?;
    let accepted = app.dialog().message(format!("Zero, apply this reviewed proposal?\nRevision: {}\nRun: {}\nFiles:\n{}\n\nThis authorizes exactly these staged contents once. Cancel rejects the proposal.", info.id, info.run_id, info.paths.join("\n")))
        .title("The Swarm — owner approval required").buttons(MessageDialogButtons::OkCancel).blocking_show();
    let result = owner_decision(&app, &approval_id, accepted, "desktop")?;
    if !accepted { return Err("Zero rejected the proposal. No files were written.".into()) } Ok(result)
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn proposals_are_immutable_and_consumed_once() { let book = ApprovalBook::default(); let i = book.stage("root".into(), vec![WriteFile { path: "a".into(), content: "v1".into(), expected: None }], "run".into()).unwrap(); assert_eq!(book.consume(&i.id).unwrap().files[0].content, "v1"); assert!(book.consume(&i.id).is_err()); }
    #[test] fn expiry_and_restart_revoke_authority() { let book = ApprovalBook::default(); let i = book.stage("root".into(), vec![], "run".into()).unwrap(); book.0.lock().unwrap().get_mut(&i.id).unwrap().info.expires_at = 0; assert!(book.consume(&i.id).is_err()); assert!(ApprovalBook::default().consume(&i.id).is_err()); }
    #[test] fn a_new_revision_revokes_old_buttons_for_the_same_run() {
        let book = ApprovalBook::default();
        let old = book.stage("root".into(), vec![], "run".into()).unwrap();
        let other = book.stage("root".into(), vec![], "other-run".into()).unwrap();
        let new = book.stage("root".into(), vec![], "run".into()).unwrap();
        assert!(book.consume(&old.id).is_err());
        assert!(book.consume(&new.id).is_ok());
        assert!(book.consume(&other.id).is_ok());
    }
    #[test] fn changed_files_cannot_be_overwritten() { let dir = std::env::temp_dir().join(format!("swarm-approval-test-{}", uuid::Uuid::new_v4())); std::fs::create_dir_all(&dir).unwrap(); let root = dunce::canonicalize(&dir).unwrap(); std::fs::write(root.join("a.txt"), "new user edit").unwrap(); assert!(validate_proposal(&root, &WriteFile { path: "a.txt".into(), content: "agent".into(), expected: Some("old".into()) }).is_err()); std::fs::remove_dir_all(dir).unwrap(); }
}
