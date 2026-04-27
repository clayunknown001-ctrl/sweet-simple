// AI Radar — OS Agent (Tauri/Rust) v2
// =====================================
// v2 yangilanishlari:
//   - Lokal NSFW filter (ONNX MobileNet via `ort` crate) — cloud chaqiriqlarini ~95% kamaytiradi
//   - Diff detection (16x16 perceptual hash) — o'zgarmagan ekran qayta yuborilmaydi
//   - Per-app whitelist (VSCode, Terminal, Figma, Cursor, Lovable...)
//   - Adaptive interval — bloklangandan keyin 12s pauza
//   - Auto-start on boot (Windows registry / Linux .desktop / macOS LaunchAgent)
//   - Statistika (har 50 iter): cloud / local_block / diff / whitelist
//
// Cargo.toml dependencies:
//   tauri = { version = "1.6", features = ["api-all", "system-tray"] }
//   tokio = { version = "1", features = ["full"] }
//   reqwest = { version = "0.12", features = ["json"] }
//   serde = { version = "1", features = ["derive"] }
//   serde_json = "1"
//   base64 = "0.22"
//   image = "0.25"
//   screenshots = "0.8"
//   ort = { version = "2.0", features = ["download-binaries"] }  # ONNX Runtime
//   ndarray = "0.16"
//   md-5 = "0.10"
//   sysinfo = "0.31"                                              # process / window detect
//   auto-launch = "0.5"                                           # auto-start on boot
//   chrono = "0.4"
//   urlencoding = "2"
//   anyhow = "1"

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
};

const API_URL: &str = "https://iwyntbeqdvsbzvmskpaw.supabase.co/functions/v1/analyze-image";
const ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eW50YmVxZHZzYnp2bXNrcGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDkyOTYsImV4cCI6MjA4ODAyNTI5Nn0.dwvan4-1Mifxo6r3WzFqxmdMiByJ63h1Jk4rkvUrc0g";

const INTERVAL_SECS: u64 = 3;
const COOLDOWN_AFTER_BLOCK: u64 = 12;
const MAX_DIM: u32 = 768;

// Lokal NSFW chegaralar
const LOCAL_NSFW_BLOCK: f32 = 0.85; // > shu — darhol blok
const LOCAL_NSFW_SAFE: f32 = 0.20;  // < shu — xavfsiz
// Oraliq → cloud AI

// Whitelist: xavfsiz process nomlari (lower)
const WHITELIST_APPS: &[&str] = &[
    "code", "code.exe", "vscode",
    "windowsterminal", "wt.exe", "cmd.exe", "powershell.exe",
    "bash", "zsh", "fish", "alacritty", "kitty", "gnome-terminal",
    "figma", "figma.exe",
    "explorer.exe", "finder",
    "lovable", "cursor", "cursor.exe",
    "notepad.exe", "gedit", "kate",
    "rustrover", "idea", "pycharm", "webstorm",
];

#[derive(Serialize)]
struct AnalyzeReq {
    image_base64: String,
    fast: bool,
    language: String,
}

#[derive(Deserialize, Debug, Default)]
struct AnalyzeRes {
    should_block: Option<bool>,
    block_reason: Option<String>,
    confidence: Option<f32>,
}

// === Statistika ===
#[derive(Default)]
struct Stats {
    cloud_calls: AtomicU64,
    local_blocks: AtomicU64,
    skipped_diff: AtomicU64,
    skipped_whitelist: AtomicU64,
    last_hash: parking_lot::Mutex<Option<String>>,
}

// === Active app detect (sysinfo) ===
fn active_app_is_whitelisted() -> bool {
    use sysinfo::System;
    // Cross-platform "foreground" topish murakkab — bu yerda
    // platform-specific kodlar bilan kengaytiriladi (Windows: GetForegroundWindow,
    // macOS: NSWorkspace, Linux: xdotool/wmctrl).
    // Hozircha: oddiy heuristic — agar process ro'yxatida whitelist app
    // CPU >5% bo'lsa, foreground deb hisoblaymiz.
    #[cfg(target_os = "windows")]
    {
        return windows_active_whitelisted();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut sys = System::new_all();
        sys.refresh_cpu_usage();
        std::thread::sleep(Duration::from_millis(150));
        sys.refresh_cpu_usage();
        for (_, p) in sys.processes() {
            let name = p.name().to_string_lossy().to_lowercase();
            if p.cpu_usage() > 5.0 && WHITELIST_APPS.iter().any(|w| name.contains(w)) {
                return true;
            }
        }
        false
    }
}

#[cfg(target_os = "windows")]
fn windows_active_whitelisted() -> bool {
    use sysinfo::{Pid, System};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0 == 0 { return false; }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 { return false; }
        let mut sys = System::new();
        sys.refresh_processes();
        if let Some(p) = sys.process(Pid::from_u32(pid)) {
            let name = p.name().to_string_lossy().to_lowercase();
            return WHITELIST_APPS.iter().any(|w| name.contains(w));
        }
        false
    }
}

// === Screenshot + diff hash ===
fn capture_and_hash() -> anyhow::Result<(image::DynamicImage, String)> {
    use image::{ImageBuffer, Rgba};
    use md5::{Digest, Md5};

    let screens = screenshots::Screen::all()?;
    let primary = screens.first().ok_or_else(|| anyhow::anyhow!("no screen"))?;
    let img = primary.capture()?;
    let (w, h) = (img.width(), img.height());
    let buf = ImageBuffer::<Rgba<u8>, _>::from_raw(w, h, img.into_raw())
        .ok_or_else(|| anyhow::anyhow!("bad buffer"))?;
    let dyn_img = image::DynamicImage::ImageRgba8(buf);
    let resized = dyn_img.thumbnail(MAX_DIM, MAX_DIM);

    // Perceptual hash: 16x16 grayscale → md5
    let small = resized.thumbnail_exact(16, 16).to_luma8();
    let mut hasher = Md5::new();
    hasher.update(small.as_raw());
    let hash = format!("{:x}", hasher.finalize());

    Ok((resized, hash))
}

fn img_to_jpeg_b64(img: &image::DynamicImage) -> anyhow::Result<String> {
    use std::io::Cursor;
    let mut buf = Cursor::new(Vec::new());
    img.to_rgb8()
        .write_to(&mut buf, image::ImageFormat::Jpeg)?;
    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        buf.into_inner(),
    ))
}

// === Lokal NSFW (ONNX MobileNet) ===
// Model: GantMan/nsfw_model (TFJS → ONNX export, ~5MB).
// Bundle yo'li: `models/nsfw_mobilenet_v2.onnx` (resources/ ichida).
// Sinflar tartibi: [Drawing, Hentai, Neutral, Porn, Sexy]
//
// Build: `cargo build --release --features local-nsfw`
// Modelsiz build: `cargo build --release` (cloud-only fallback)

#[cfg(feature = "local-nsfw")]
mod nsfw {
    use anyhow::{anyhow, Result};
    use image::DynamicImage;
    use ndarray::{Array4, Axis};
    use ort::{session::Session, value::Value};
    use std::path::PathBuf;
    use std::sync::OnceLock;

    static SESSION: OnceLock<Option<Session>> = OnceLock::new();

    fn model_path() -> PathBuf {
        // Tauri resource yo'li yoki ENV override
        if let Ok(p) = std::env::var("AI_RADAR_NSFW_MODEL") {
            return PathBuf::from(p);
        }
        std::env::current_exe()
            .ok()
            .and_then(|e| e.parent().map(|p| p.join("models/nsfw_mobilenet_v2.onnx")))
            .unwrap_or_else(|| PathBuf::from("models/nsfw_mobilenet_v2.onnx"))
    }

    fn session() -> Option<&'static Session> {
        SESSION
            .get_or_init(|| {
                let path = model_path();
                if !path.exists() {
                    eprintln!("[nsfw] model topilmadi: {} — cloud-only", path.display());
                    return None;
                }
                Session::builder()
                    .ok()
                    .and_then(|b| b.commit_from_file(&path).ok())
                    .or_else(|| {
                        eprintln!("[nsfw] sessiya yarata olmadi");
                        None
                    })
            })
            .as_ref()
    }

    /// 224x224 RGB → [1,3,224,224] f32 normalized (0..1)
    fn preprocess(img: &DynamicImage) -> Array4<f32> {
        let resized = img
            .resize_exact(224, 224, image::imageops::FilterType::Triangle)
            .to_rgb8();
        let mut arr = Array4::<f32>::zeros((1, 3, 224, 224));
        for (x, y, p) in resized.enumerate_pixels() {
            arr[[0, 0, y as usize, x as usize]] = p[0] as f32 / 255.0;
            arr[[0, 1, y as usize, x as usize]] = p[1] as f32 / 255.0;
            arr[[0, 2, y as usize, x as usize]] = p[2] as f32 / 255.0;
        }
        arr
    }

    pub fn score(img: &DynamicImage) -> Option<f32> {
        let sess = session()?;
        let input = preprocess(img);
        let value = Value::from_array(input).ok()?;
        let outputs = sess.run(ort::inputs!["input" => value].ok()?).ok()?;
        let (_, out) = outputs.iter().next()?;
        let tensor = out.try_extract_tensor::<f32>().ok()?;
        let view = tensor.view();
        let scores: Vec<f32> = view.iter().copied().collect();
        if scores.len() < 5 { return None; }
        // [Drawing, Hentai, Neutral, Porn, Sexy]
        let nsfw = scores[1] + scores[3] + scores[4] * 0.5;
        Some(nsfw.min(1.0))
    }
}

fn local_nsfw_score(_img: &image::DynamicImage) -> Option<f32> {
    #[cfg(feature = "local-nsfw")]
    { return nsfw::score(_img); }
    #[cfg(not(feature = "local-nsfw"))]
    { None }
}

// === Cloud API ===
async fn analyze_cloud(client: &reqwest::Client, b64: String) -> anyhow::Result<AnalyzeRes> {
    let res = client
        .post(API_URL)
        .bearer_auth(ANON_KEY)
        .header("apikey", ANON_KEY)
        .json(&AnalyzeReq {
            image_base64: b64,
            fast: true,
            language: "uz".into(),
        })
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    if matches!(res.status().as_u16(), 402 | 429) {
        eprintln!("[!] Quota: {} — pause 60s", res.status());
        tokio::time::sleep(Duration::from_secs(60)).await;
        return Ok(AnalyzeRes::default());
    }
    Ok(res.json::<AnalyzeRes>().await.unwrap_or_default())
}

// === Blackout window ===
fn show_blackout(app: &tauri::AppHandle, reason: String) {
    let label = format!("blackout-{}", chrono::Utc::now().timestamp_millis());
    let _ = tauri::WindowBuilder::new(
        app,
        &label,
        tauri::WindowUrl::App(
            format!("blackout.html?reason={}", urlencoding::encode(&reason)).into(),
        ),
    )
    .fullscreen(true)
    .always_on_top(true)
    .decorations(false)
    .skip_taskbar(true)
    .build();
}

// === Auto-start ===
fn setup_autostart() {
    use auto_launch::AutoLaunchBuilder;
    if let Ok(exe) = std::env::current_exe() {
        let _ = AutoLaunchBuilder::new()
            .set_app_name("AI Radar")
            .set_app_path(&exe.to_string_lossy())
            .set_use_launch_agent(true)
            .build()
            .and_then(|al| al.enable());
    }
}

// === Asosiy loop ===
async fn monitor_loop(handle: tauri::AppHandle, paused: Arc<AtomicBool>, stats: Arc<Stats>) {
    let client = reqwest::Client::new();
    let mut iter: u64 = 0;

    loop {
        if paused.load(Ordering::Relaxed) {
            tokio::time::sleep(Duration::from_secs(2)).await;
            continue;
        }
        iter += 1;

        // 1. Whitelist (eng tez)
        if active_app_is_whitelisted() {
            stats.skipped_whitelist.fetch_add(1, Ordering::Relaxed);
            tokio::time::sleep(Duration::from_secs(INTERVAL_SECS)).await;
            continue;
        }

        // 2. Screenshot + diff
        let (img, hash) = match tokio::task::spawn_blocking(capture_and_hash).await {
            Ok(Ok(v)) => v,
            _ => {
                tokio::time::sleep(Duration::from_secs(INTERVAL_SECS)).await;
                continue;
            }
        };
        {
            let mut last = stats.last_hash.lock();
            if last.as_deref() == Some(hash.as_str()) {
                stats.skipped_diff.fetch_add(1, Ordering::Relaxed);
                drop(last);
                tokio::time::sleep(Duration::from_secs(INTERVAL_SECS)).await;
                continue;
            }
            *last = Some(hash);
        }

        // 3. Lokal NSFW
        if let Some(score) = local_nsfw_score(&img) {
            if score >= LOCAL_NSFW_BLOCK {
                stats.local_blocks.fetch_add(1, Ordering::Relaxed);
                let reason = format!("Lokal NSFW (score={:.2})", score);
                eprintln!("[LOCAL BLOCK] {}", reason);
                show_blackout(&handle, reason);
                tokio::time::sleep(Duration::from_secs(COOLDOWN_AFTER_BLOCK)).await;
                continue;
            }
            if score <= LOCAL_NSFW_SAFE {
                tokio::time::sleep(Duration::from_secs(INTERVAL_SECS)).await;
                continue;
            }
            // oraliq → cloud
        }

        // 4. Cloud AI
        stats.cloud_calls.fetch_add(1, Ordering::Relaxed);
        let b64 = match img_to_jpeg_b64(&img) {
            Ok(v) => v,
            Err(_) => {
                tokio::time::sleep(Duration::from_secs(INTERVAL_SECS)).await;
                continue;
            }
        };
        match analyze_cloud(&client, b64).await {
            Ok(res) if res.should_block.unwrap_or(false)
                && res.confidence.unwrap_or(0.0) > 0.65 =>
            {
                let reason = res.block_reason.unwrap_or_else(|| "Zararli kontent".into());
                eprintln!("[CLOUD BLOCK] {} (conf={:.2})", reason,
                          res.confidence.unwrap_or(0.0));
                show_blackout(&handle, reason);
                tokio::time::sleep(Duration::from_secs(COOLDOWN_AFTER_BLOCK)).await;
                continue;
            }
            _ => {}
        }

        // Statistika
        if iter % 50 == 0 {
            let c = stats.cloud_calls.load(Ordering::Relaxed);
            let lb = stats.local_blocks.load(Ordering::Relaxed);
            let d = stats.skipped_diff.load(Ordering::Relaxed);
            let w = stats.skipped_whitelist.load(Ordering::Relaxed);
            let total = (c + lb + d + w).max(1);
            let saved = (1.0 - c as f64 / total as f64) * 100.0;
            eprintln!(
                "[STATS] cloud={} lokal_blok={} diff={} whitelist={} → tejash={:.0}%",
                c, lb, d, w, saved
            );
        }

        tokio::time::sleep(Duration::from_secs(INTERVAL_SECS)).await;
    }
}

#[tokio::main]
async fn main() {
    setup_autostart();

    let paused = Arc::new(AtomicBool::new(false));
    let stats = Arc::new(Stats::default());

    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("toggle".to_string(), "⏸ Pauza/Davom"))
        .add_item(CustomMenuItem::new("stats".to_string(), "📊 Statistika"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit".to_string(), "Chiqish"));

    let paused_tray = paused.clone();
    let stats_tray = stats.clone();

    tauri::Builder::default()
        .system_tray(SystemTray::new().with_menu(tray_menu))
        .on_system_tray_event(move |_app, event| {
            if let SystemTrayEvent::MenuItemClick { id, .. } = event {
                match id.as_str() {
                    "quit" => std::process::exit(0),
                    "toggle" => {
                        let cur = paused_tray.load(Ordering::Relaxed);
                        paused_tray.store(!cur, Ordering::Relaxed);
                        eprintln!("[tray] paused={}", !cur);
                    }
                    "stats" => {
                        let c = stats_tray.cloud_calls.load(Ordering::Relaxed);
                        let lb = stats_tray.local_blocks.load(Ordering::Relaxed);
                        let d = stats_tray.skipped_diff.load(Ordering::Relaxed);
                        let w = stats_tray.skipped_whitelist.load(Ordering::Relaxed);
                        eprintln!("[STATS] cloud={} lokal={} diff={} whitelist={}", c, lb, d, w);
                    }
                    _ => {}
                }
            }
        })
        .setup(move |app| {
            let handle = app.handle();
            let p = paused.clone();
            let s = stats.clone();
            tokio::spawn(async move {
                monitor_loop(handle, p, s).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
