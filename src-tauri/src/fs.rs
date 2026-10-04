//! Project file access, confined to folders the user approved in a native dialog.
//!
//! Approval lives here, not in the webview: the only way to add a root is
//! `pick_project_folder`, which needs the user to choose it in an OS dialog.
//! Every read/write re-checks that the root is approved and that the resolved
//! path (symlinks included) stays inside it.

use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

const MAX_FILE_BYTES: usize = 1_000_000;
const MAX_FILES_PER_APPLY: usize = 60;
pub(crate) const SKIP_DIRS: &[&str] = &[
    ".git", "node_modules", "target", "dist", "build", ".next", ".turbo", "__pycache__", "venv", ".venv", ".idea", ".vscode",
];

#[derive(Default)]
pub struct ApprovedRoots(Mutex<HashSet<PathBuf>>);

impl ApprovedRoots {
    pub fn set(&self, roots: HashSet<PathBuf>) {
        *self.0.lock().unwrap() = roots;
    }
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("approved_roots.json"))
}

/// Load persisted approvals at startup. Roots that no longer exist are dropped.
pub fn load_approved(app: &AppHandle) -> HashSet<PathBuf> {
    store_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .collect()
}

fn persist(app: &AppHandle, roots: &HashSet<PathBuf>) -> Result<(), String> {
    let list: Vec<String> = roots.iter().map(|p| p.to_string_lossy().into_owned()).collect();
    fs::write(store_path(app)?, serde_json::to_string(&list).unwrap()).map_err(|e| e.to_string())
}

fn canonical(p: &Path) -> Result<PathBuf, String> {
    dunce::canonicalize(p).map_err(|e| format!("Cannot resolve {}: {e}", p.display()))
}

/// Root must be an approved folder; returns its canonical form.
pub(crate) fn approved_root(state: &ApprovedRoots, root: &str) -> Result<PathBuf, String> {
    let c = canonical(Path::new(root))?;
    if state.0.lock().unwrap().contains(&c) {
        Ok(c)
    } else {
        Err("This folder has not been approved. Choose it with the folder picker first.".into())
    }
}

/// Validates a project-relative path and joins it to the root (no filesystem access yet).
fn join_rel(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim();
    if rel.is_empty() || rel.len() > 240 || rel.contains('\0') {
        return Err("Invalid path".into());
    }
    if rel.starts_with('/') || rel.starts_with('\\') || rel.contains(':') {
        return Err("Path must be relative to the project folder".into());
    }
    let mut out = root.to_path_buf();
    for part in rel.split(['/', '\\']).filter(|p| !p.is_empty() && *p != ".") {
        if part == ".." {
            return Err("Path may not contain '..'".into());
        }
        if part.eq_ignore_ascii_case(".git") {
            return Err("Writing inside .git is not allowed".into());
        }
        if part.ends_with('.') || part.ends_with(' ') {
            return Err("Invalid file name".into());
        }
        out.push(part);
    }
    if out == root {
        return Err("Invalid path".into());
    }
    // Defence in depth: after joining, every component must still be a normal one.
    if out.strip_prefix(root).map(|r| r.components().any(|c| !matches!(c, Component::Normal(_)))).unwrap_or(true) {
        return Err("Invalid path".into());
    }
    Ok(out)
}

/// Deepest existing ancestor must resolve (through symlinks) to somewhere inside root.
fn ensure_inside(root: &Path, target: &Path) -> Result<(), String> {
    let mut cur = target.to_path_buf();
    while !cur.exists() {
        if !cur.pop() {
            return Err("Path escapes the project folder".into());
        }
    }
    if canonical(&cur)?.starts_with(root) {
        Ok(())
    } else {
        Err("Path escapes the project folder".into())
    }
}

// ───────────── commands ─────────────

#[tauri::command]
pub async fn pick_project_folder(app: AppHandle, state: State<'_, ApprovedRoots>) -> Result<Option<String>, String> {
    let Some(picked) = app.dialog().file().set_title("Choose the project folder ZeroPulse Swarm may read and write").blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let c = canonical(&path)?;
    let mut roots = state.0.lock().unwrap();
    roots.insert(c.clone());
    persist(&app, &roots)?;
    Ok(Some(c.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn is_root_approved(root: String, state: State<'_, ApprovedRoots>) -> bool {
    approved_root(&state, &root).is_ok()
}

#[tauri::command]
pub fn fs_list_tree(root: String, max_entries: usize, state: State<'_, ApprovedRoots>) -> Result<Vec<String>, String> {
    let root = approved_root(&state, &root)?;
    let max = max_entries.clamp(1, 600);
    let mut out = Vec::new();
    fn walk(dir: &Path, root: &Path, depth: usize, max: usize, out: &mut Vec<String>) {
        if depth > 4 || out.len() >= max {
            return;
        }
        let Ok(rd) = fs::read_dir(dir) else { return };
        let mut entries: Vec<_> = rd.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            if out.len() >= max {
                return;
            }
            let name = e.file_name().to_string_lossy().into_owned();
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            let rel = e.path().strip_prefix(root).map(|p| p.to_string_lossy().replace('\\', "/")).unwrap_or_default();
            if ft.is_dir() {
                if SKIP_DIRS.contains(&name.as_str()) {
                    continue;
                }
                walk(&e.path(), root, depth + 1, max, out);
            } else {
                out.push(rel);
            }
        }
    }
    walk(&root, &root, 0, max, &mut out);
    Ok(out)
}

#[derive(Serialize)]
pub struct ReadResult {
    exists: bool,
    content: String,
    truncated: bool,
    binary: bool,
}

#[tauri::command]
pub fn fs_read_text(root: String, path: String, max_bytes: usize, state: State<'_, ApprovedRoots>) -> Result<ReadResult, String> {
    let root = approved_root(&state, &root)?;
    let target = join_rel(&root, &path)?;
    ensure_inside(&root, &target)?;
    let meta = match fs::symlink_metadata(&target) {
        Ok(m) => m,
        Err(_) => return Ok(ReadResult { exists: false, content: String::new(), truncated: false, binary: false }),
    };
    if !meta.is_file() {
        return Err("Not a regular file".into());
    }
    let cap = max_bytes.clamp(1, MAX_FILE_BYTES);
    let bytes = fs::read(&target).map_err(|e| e.to_string())?;
    let truncated = bytes.len() > cap;
    let slice = &bytes[..bytes.len().min(cap)];
    match std::str::from_utf8(slice) {
        Ok(s) => Ok(ReadResult { exists: true, content: s.to_string(), truncated, binary: false }),
        // A cut-off multi-byte char at the cap is fine; anything else is binary.
        Err(e) if truncated && e.valid_up_to() + 4 > slice.len() => Ok(ReadResult {
            exists: true,
            content: String::from_utf8_lossy(&slice[..e.valid_up_to()]).into_owned(),
            truncated,
            binary: false,
        }),
        Err(_) => Ok(ReadResult { exists: true, content: String::new(), truncated, binary: true }),
    }
}

#[derive(Deserialize)]
pub struct WriteFile {
    path: String,
    content: String,
}

#[derive(Serialize)]
pub struct WriteOutcome {
    path: String,
    ok: bool,
    created: bool,
    error: Option<String>,
}

#[tauri::command]
pub fn fs_apply(root: String, files: Vec<WriteFile>, state: State<'_, ApprovedRoots>) -> Result<Vec<WriteOutcome>, String> {
    let root = approved_root(&state, &root)?;
    if files.len() > MAX_FILES_PER_APPLY {
        return Err(format!("Too many files in one apply (max {MAX_FILES_PER_APPLY})"));
    }
    let mut out = Vec::with_capacity(files.len());
    for f in files {
        let res = (|| -> Result<bool, String> {
            if f.content.len() > MAX_FILE_BYTES {
                return Err("File exceeds 1 MB".into());
            }
            let target = join_rel(&root, &f.path)?;
            ensure_inside(&root, &target)?;
            if let Ok(m) = fs::symlink_metadata(&target) {
                if m.file_type().is_symlink() || !m.is_file() {
                    return Err("Refusing to overwrite a symlink or non-file".into());
                }
            }
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                // Re-check after creation in case a symlinked directory redirected it.
                if !canonical(parent)?.starts_with(&root) {
                    return Err("Path escapes the project folder".into());
                }
            }
            let created = !target.exists();
            fs::write(&target, f.content.as_bytes()).map_err(|e| e.to_string())?;
            Ok(created)
        })();
        out.push(match res {
            Ok(created) => WriteOutcome { path: f.path, ok: true, created, error: None },
            Err(e) => WriteOutcome { path: f.path, ok: false, created: false, error: Some(e) },
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_paths() {
        let root = std::env::temp_dir();
        for bad in ["", "../x", "a/../../x", "/etc/passwd", "C:\\x", "a:b", ".git/config", "a/.GIT/x", "a\\..\\b", "x.", "."] {
            assert!(join_rel(&root, bad).is_err(), "should reject {bad:?}");
        }
        for good in ["a.txt", "src/lib/a.ts", "src\\win\\a.ts", "./x/y.rs"] {
            assert!(join_rel(&root, good).unwrap().starts_with(&root), "should accept {good:?}");
        }
    }

    #[test]
    fn apply_stays_inside_root() {
        let dir = std::env::temp_dir().join(format!("zp-fs-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let root = canonical(&dir).unwrap();
        let target = join_rel(&root, "src/a.txt").unwrap();
        assert!(ensure_inside(&root, &target).is_ok());
        assert!(ensure_inside(&root, &root.parent().unwrap().join("outside.txt")).is_err());
        fs::remove_dir_all(&dir).ok();
    }
}
