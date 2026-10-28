//! Windows capture is restricted to this process's own Tauri window. No desktop
//! or caller-supplied window handle is accepted. Consent is native and per use.
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
#[derive(Default)]
pub struct CaptureState(Mutex<Option<Arc<AtomicBool>>>);

#[cfg(windows)]
fn frame(app: &AppHandle) -> Result<(u32, u32, Vec<u8>), String> {
    #[repr(C)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[repr(C)]
    struct Info {
        size: u32,
        width: i32,
        height: i32,
        planes: u16,
        bits: u16,
        compression: u32,
        image: u32,
        x: i32,
        y: i32,
        used: u32,
        important: u32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn GetWindowRect(h: isize, r: *mut Rect) -> i32;
        fn GetDC(h: isize) -> isize;
        fn ReleaseDC(h: isize, d: isize) -> i32;
        fn PrintWindow(h: isize, d: isize, flags: u32) -> i32;
    }
    #[link(name = "gdi32")]
    extern "system" {
        fn CreateCompatibleDC(d: isize) -> isize;
        fn CreateCompatibleBitmap(d: isize, w: i32, h: i32) -> isize;
        fn SelectObject(d: isize, o: isize) -> isize;
        fn DeleteObject(o: isize) -> i32;
        fn DeleteDC(d: isize) -> i32;
        fn GetDIBits(
            d: isize,
            b: isize,
            start: u32,
            lines: u32,
            data: *mut u8,
            info: *mut Info,
            usage: u32,
        ) -> i32;
    }
    let window = app
        .get_webview_window("main")
        .ok_or("Swarm window unavailable")?;
    let hwnd = window.hwnd().map_err(|_| "Window capture unavailable")?.0 as isize;
    unsafe {
        let mut rect = Rect {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return Err("Cannot inspect own window".into());
        }
        let w = rect.right - rect.left;
        let h = rect.bottom - rect.top;
        if !(100..=3840).contains(&w) || !(100..=2160).contains(&h) {
            return Err("Capture window dimensions exceed safe bounds".into());
        }
        let dc = GetDC(hwnd);
        let memory = CreateCompatibleDC(dc);
        let bitmap = CreateCompatibleBitmap(dc, w, h);
        if dc == 0 || memory == 0 || bitmap == 0 {
            if bitmap != 0 {
                DeleteObject(bitmap);
            }
            if memory != 0 {
                DeleteDC(memory);
            }
            if dc != 0 {
                ReleaseDC(hwnd, dc);
            }
            return Err("Capture resources unavailable".into());
        }
        let old = SelectObject(memory, bitmap);
        let captured = PrintWindow(hwnd, memory, 2);
        SelectObject(memory, old);
        let mut bytes = vec![0u8; (w * h * 4) as usize];
        let mut info = Info {
            size: 40,
            width: w,
            height: -h,
            planes: 1,
            bits: 32,
            compression: 0,
            image: 0,
            x: 0,
            y: 0,
            used: 0,
            important: 0,
        };
        let lines = if captured != 0 {
            GetDIBits(
                memory,
                bitmap,
                0,
                h as u32,
                bytes.as_mut_ptr(),
                &mut info,
                0,
            )
        } else {
            0
        };
        DeleteObject(bitmap);
        DeleteDC(memory);
        ReleaseDC(hwnd, dc);
        if lines != h {
            return Err("Own-window capture failed; use an approved OS screenshot instead".into());
        }
        for pixel in bytes.chunks_exact_mut(4) {
            pixel.swap(0, 2);
            pixel[3] = 255;
        }
        Ok((w as u32, h as u32, bytes))
    }
}
#[cfg(not(windows))]
fn frame(_: &AppHandle) -> Result<(u32, u32, Vec<u8>), String> {
    Err("Own-window capture is implemented for Windows only. macOS capture permission and signing remain manual.".into())
}
#[tauri::command]
pub fn capture_stop(app: AppHandle) {
    if let Some(flag) = app.state::<CaptureState>().0.lock().unwrap().as_ref() {
        flag.store(true, Ordering::Relaxed)
    }
}
#[tauri::command]
pub async fn capture_evidence(
    app: AppHandle,
    record: bool,
) -> Result<crate::media::Artifact, String> {
    let stop = Arc::new(AtomicBool::new(false));
    {
        let state = app.state::<CaptureState>();
        let mut active = state.0.lock().unwrap();
        if active.is_some() {
            return Err("A capture is already active".into());
        }
        *active = Some(stop.clone());
    }
    let job_app = app.clone();
    let result=tauri::async_runtime::spawn_blocking(move||{
        if !job_app.dialog().message(if record{"Zero, record ONLY The Swarm window for 15 seconds and authorize this clip for your paired Telegram destination? Avoid credentials and private project material. A visible indicator and Stop control will remain available. No microphone or other windows are captured."}else{"Zero, capture ONLY The Swarm window and authorize this screenshot for your paired Telegram destination? Confirm the visible app contains no credentials or private material. No other desktop windows are captured."}).title("Scoped capture permission").buttons(MessageDialogButtons::OkCancel).blocking_show(){return Err("Capture consent declined".into())}
        let _=job_app.emit("capture-state",true);
        let (w,h,first)=frame(&job_app)?;
        if !record{
            let mut bytes=Vec::new();{let mut enc=png::Encoder::new(&mut bytes,w,h);enc.set_color(png::ColorType::Rgba);enc.set_depth(png::BitDepth::Eight);enc.write_header().map_err(|_|"PNG encoder unavailable")?.write_image_data(&first).map_err(|_|"PNG capture failed")?;}
            return crate::media::save(&job_app,"swarm-window.png",&bytes)
        }
        use std::{process::{Command,Stdio},io::Write,time::{Duration,Instant}};
        let exe=std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).map(|p|p.join(if cfg!(windows){"ffmpeg.exe"}else{"ffmpeg"})).find(|p|p.is_file()).ok_or("FFmpeg not found on PATH. Install an approved local FFmpeg build, restart The Swarm, and retry. No recording was fabricated.")?;
        let path=job_app.path().app_data_dir().map_err(|_|"App data unavailable")?.join(format!("capture-{}.mp4",uuid::Uuid::new_v4()));
        let mut cmd=Command::new(exe);
        cmd.args(["-hide_banner","-loglevel","error","-f","rawvideo","-pixel_format","rgba","-video_size",&format!("{w}x{h}"),"-framerate","8","-i","pipe:0","-an","-vf","scale=trunc(iw/2)*2:trunc(ih/2)*2","-c:v","libx264","-preset","veryfast","-crf","28","-pix_fmt","yuv420p","-movflags","+faststart","-fs","48000000"])
            .arg(&path).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null());
        #[cfg(windows)]{use std::os::windows::process::CommandExt;cmd.creation_flags(0x0800_0000);}
        let mut child=cmd.spawn().map_err(|_|"FFmpeg could not start")?;
        let mut input=child.stdin.take().ok_or("Encoder input unavailable")?;
        let start=Instant::now();let mut failure=None;
        for n in 0..120{
            if stop.load(Ordering::Relaxed){failure=Some("Recording stopped; partial evidence was discarded".to_string());break}
            let next=if n==0{Ok((w,h,first.clone()))}else{frame(&job_app)};
            match next{Ok((nw,nh,bytes))if nw==w&&nh==h=>if input.write_all(&bytes).is_err(){failure=Some("Video encoder stopped".into());break},_=>{failure=Some("Window changed size or capture failed; clip discarded".into());break}}
            std::thread::sleep((Duration::from_millis((n+1)*125)).saturating_sub(start.elapsed()));
        }
        drop(input);
        if failure.is_some(){let _=child.kill();}
        let finish=Instant::now();let status=loop{if let Some(s)=child.try_wait().map_err(|_|"Cannot inspect encoder")?{break s}if finish.elapsed()>Duration::from_secs(10){let _=child.kill();let _=child.wait();let _=std::fs::remove_file(&path);return Err("Encoder timed out".into())}std::thread::sleep(Duration::from_millis(50));};
        let bytes=std::fs::read(&path).unwrap_or_default();let _=std::fs::remove_file(&path);
        if let Some(e)=failure{return Err(e)}if !status.success(){return Err("Video encoder failed; no clip delivered".into())}
        crate::media::save(&job_app,"swarm-demo-15s.mp4",&bytes)
    }).await.map_err(|_|"Capture worker failed".to_string()).and_then(|r|r);
    app.state::<CaptureState>().0.lock().unwrap().take();
    let _ = app.emit("capture-state", false);
    result
}
