//! Immutable, owner-selected evidence. Telegram can retrieve existing approved
//! snapshots, but cannot start capture or choose filesystem paths.
use std::{path::PathBuf, time::{SystemTime, UNIX_EPOCH}};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use sha2::{Digest, Sha256};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Artifact { pub id: String, pub name: String, pub kind: String, pub mime: String, pub size: usize, pub created_at: u64, pub digest: String }
fn directory(app: &AppHandle) -> Result<PathBuf,String> {
    let p=app.path().app_data_dir().map_err(|_|"App data unavailable")?.join("approved-media");
    std::fs::create_dir_all(&p).map_err(|_|"Cannot create evidence store")?; Ok(p)
}
pub fn classify(name: &str, bytes: &[u8]) -> Result<(&'static str,&'static str),String> {
    let lower=name.to_ascii_lowercase();
    let result=if lower.ends_with(".png") && bytes.starts_with(b"\x89PNG\r\n\x1a\n") { ("photo","image/png") }
    else if (lower.ends_with(".jpg")||lower.ends_with(".jpeg")) && bytes.starts_with(&[255,216,255]) { ("photo","image/jpeg") }
    else if lower.ends_with(".mp4") && bytes.get(4..8)==Some(b"ftyp") { ("video","video/mp4") }
    else if lower.ends_with(".txt") || lower.ends_with(".md") {
        let text=std::str::from_utf8(bytes).map_err(|_|"Report must be UTF-8")?;
        let sensitive=text.to_ascii_lowercase();
        if bytes.len()>256_000 || ["sk-","password=","bearer ","private key","api_key","bot_token","```"].iter().any(|s|sensitive.contains(s)) { return Err("Report may contain credentials or raw code. Create a sanitized report first.".into()) }
        ("document","text/plain")
    } else { return Err("Supported evidence: PNG/JPEG, MP4, sanitized TXT/Markdown reports. Source archives and binaries are blocked.".into()) };
    let limit=if result.0=="photo" {10_000_000} else {49_000_000};
    if bytes.is_empty() || bytes.len()>limit { return Err("Evidence is empty or exceeds the Telegram upload limit. Compress it locally first.".into()) } Ok(result)
}
pub fn save(app:&AppHandle,name:&str,bytes:&[u8])->Result<Artifact,String> {
    let (kind,mime)=classify(name,bytes)?;
    let a=Artifact{id:uuid::Uuid::new_v4().to_string(),name:name.into(),kind:kind.into(),mime:mime.into(),size:bytes.len(),created_at:SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),digest:format!("{:x}",Sha256::digest(bytes))};
    let dir=directory(app)?;
    // Each UUID snapshot is created once; no renderer-selected output path.
    use std::io::Write;
    let mut f=std::fs::OpenOptions::new().write(true).create_new(true).open(dir.join(&a.id)).map_err(|_|"Cannot snapshot evidence")?;
    f.write_all(bytes).and_then(|_|f.sync_all()).map_err(|_|"Cannot commit evidence snapshot")?;
    std::fs::write(dir.join(format!("{}.json",a.id)),serde_json::to_vec(&a).unwrap()).map_err(|_|"Cannot commit evidence metadata")?;
    Ok(a)
}
#[tauri::command]
pub fn media_list(app:AppHandle)->Result<Vec<Artifact>,String> {
    let mut rows:Vec<Artifact>=std::fs::read_dir(directory(&app)?).map_err(|_|"Cannot list evidence")?.flatten()
        .filter(|e|e.path().extension().is_some_and(|s|s=="json"))
        .filter_map(|e|std::fs::read(e.path()).ok().and_then(|b|serde_json::from_slice(&b).ok())).collect();
    rows.sort_by_key(|a|std::cmp::Reverse(a.created_at)); rows.truncate(100); Ok(rows)
}
pub fn read(app:&AppHandle,id:&str)->Result<(Artifact,Vec<u8>),String> {
    uuid::Uuid::parse_str(id).map_err(|_|"Invalid evidence reference")?;
    let a=media_list(app.clone())?.into_iter().find(|a|a.id==id).ok_or("No authorized evidence exists")?;
    let path=directory(app)?.join(id);
    if path.is_symlink() {return Err("Evidence symlinks are blocked".into())}
    let bytes=std::fs::read(path).map_err(|_|"Evidence snapshot unavailable")?;
    if bytes.len()!=a.size || format!("{:x}",Sha256::digest(&bytes))!=a.digest { return Err("Evidence snapshot changed; approve a fresh copy".into()) }
    classify(&a.name,&bytes)?; Ok((a,bytes))
}
#[tauri::command]
pub fn media_import(app:AppHandle, root:String)->Result<Artifact,String> {
    let approved=crate::fs::approved_root(&app.state::<crate::fs::ApprovedRoots>(),&root)?;
    let chosen=app.dialog().file().set_title("Select sanitized evidence inside the approved project").blocking_pick_file().ok_or("Evidence selection cancelled")?.into_path().map_err(|_|"Local files only")?;
    let path=dunce::canonicalize(&chosen).map_err(|_|"Cannot resolve evidence")?;
    if !path.starts_with(&approved) || chosen.is_symlink() {return Err("Evidence must stay inside the approved project root".into())}
    let size=std::fs::metadata(&path).map_err(|_|"Evidence unavailable")?.len();
    if size>49_000_000 {return Err("File exceeds evidence limit".into())}
    let bytes=std::fs::read(&path).map_err(|_|"Cannot read evidence")?;
    let name=path.file_name().and_then(|s|s.to_str()).ok_or("Invalid evidence filename")?;
    classify(name,&bytes)?;
    if !app.dialog().message(format!("Zero, allow the selected {name} ({size} bytes) to be sent to your paired Telegram destination and retrieved later with /preview, /recording or /files? Confirm it contains no private messages, credentials, raw code or unrelated content.")).title("Authorize evidence sharing").buttons(MessageDialogButtons::OkCancel).blocking_show() {return Err("Evidence sharing cancelled".into())}
    save(&app,name,&bytes)
}
#[cfg(test)]mod tests {
    use super::*;
    #[test]fn validates_magic_and_never_accepts_archives_or_code(){assert!(classify("x.png",b"not a png").is_err());assert!(classify("x.zip",b"PK").is_err());assert!(classify("x.md",b"```secret code").is_err());assert!(classify("report.txt",b"QA pending owner review").is_ok());}
    #[test]fn validates_video_and_photo_limits(){assert!(classify("x.mp4",b"0000ftypisom").is_ok());assert!(classify("x.mp4",b"fake video").is_err());let mut bytes=vec![0;10_000_001];bytes[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");assert!(classify("x.png",&bytes).is_err());}
}
