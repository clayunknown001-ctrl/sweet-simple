// AI Radar — OS Agent (Tauri/Rust skeleton)
// Production uchun. Hozircha skeleton — `cargo tauri dev` bilan ishlaydi.
//
// Nima qiladi:
//   - Har 3 soniyada ekran screenshot oladi (`screenshots` crate)
//   - Lovable Cloud edge function'ga base64 jo'natadi
//   - should_block: true bo'lsa — fullscreen blackout window chiqaradi
//   - System tray ikonka orqali boshqariladi
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

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem, CustomMenuItem};

const API_URL: &str = "https://iwyntbeqdvsbzvmskpaw.supabase.co/functions/v1/analyze-image";
const ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eW50YmVxZHZzYnp2bXNrcGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDkyOTYsImV4cCI6MjA4ODAyNTI5Nn0.dwvan4-1Mifxo6r3WzFqxmdMiByJ63h1Jk4rkvUrc0g";

#[derive(Serialize)]
struct AnalyzeReq {
    image_base64: String,
    fast: bool,
    language: String,
}

#[derive(Deserialize, Debug)]
struct AnalyzeRes {
    should_block: Option<bool>,
    block_reason: Option<String>,
    confidence: Option<f32>,
}

async fn capture_and_analyze(client: &reqwest::Client) -> anyhow::Result<Option<String>> {
    use image::{ImageBuffer, Rgba};
    use std::io::Cursor;

    // 1. Screenshot
    let screens = screenshots::Screen::all()?;
    let primary = screens.first().ok_or_else(|| anyhow::anyhow!("no screen"))?;
    let img = primary.capture()?;

    // 2. Downscale to 768px
    let dyn_img = image::DynamicImage::ImageRgba8(
        ImageBuffer::<Rgba<u8>, _>::from_raw(img.width(), img.height(), img.into_raw())
            .ok_or_else(|| anyhow::anyhow!("bad buffer"))?,
    );
    let resized = dyn_img.thumbnail(768, 768);

    // 3. JPEG encode + base64
    let mut buf = Cursor::new(Vec::new());
    resized.to_rgb8().write_to(&mut buf, image::ImageFormat::Jpeg)?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());

    // 4. POST
    let res: AnalyzeRes = client
        .post(API_URL)
        .bearer_auth(ANON_KEY)
        .header("apikey", ANON_KEY)
        .json(&AnalyzeReq { image_base64: b64, fast: true, language: "uz".into() })
        .send()
        .await?
        .json()
        .await?;

    if res.should_block.unwrap_or(false) && res.confidence.unwrap_or(0.0) > 0.65 {
        return Ok(Some(res.block_reason.unwrap_or_else(|| "Zararli kontent".into())));
    }
    Ok(None)
}

fn show_blackout(app: &tauri::AppHandle, reason: String) {
    // Fullscreen, always-on-top, transparent-background window
    let label = format!("blackout-{}", chrono::Utc::now().timestamp_millis());
    let _ = tauri::WindowBuilder::new(
        app,
        &label,
        tauri::WindowUrl::App(format!("blackout.html?reason={}", urlencoding::encode(&reason)).into()),
    )
    .fullscreen(true)
    .always_on_top(true)
    .decorations(false)
    .skip_taskbar(true)
    .build();
}

#[tokio::main]
async fn main() {
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("toggle".to_string(), "Pauza/Davom"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit".to_string(), "Chiqish"));

    tauri::Builder::default()
        .system_tray(SystemTray::new().with_menu(tray_menu))
        .on_system_tray_event(|app, event| {
            if let SystemTrayEvent::MenuItemClick { id, .. } = event {
                if id == "quit" {
                    std::process::exit(0);
                }
            }
        })
        .setup(|app| {
            let handle = app.handle();
            tokio::spawn(async move {
                let client = reqwest::Client::new();
                loop {
                    match capture_and_analyze(&client).await {
                        Ok(Some(reason)) => {
                            println!("[BLOCK] {}", reason);
                            let h = handle.clone();
                            tauri::async_runtime::spawn(async move {
                                show_blackout(&h, reason);
                            });
                            tokio::time::sleep(Duration::from_secs(12)).await;
                        }
                        Ok(None) => print!("."),
                        Err(e) => eprintln!("[err] {}", e),
                    }
                    tokio::time::sleep(Duration::from_secs(3)).await;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
