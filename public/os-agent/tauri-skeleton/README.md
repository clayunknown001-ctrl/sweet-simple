# AI Radar — OS Agent (Tauri/Rust)

Production-ready skeleton. Tauri 1.6 + Rust.

## Hozirgi holat

Bu **skeleton** — ya'ni `Cargo.toml`, `tauri.conf.json` va asosiy `main.rs`
fayllari yaratilgan. To'liq build qilish uchun:

```bash
# 1. Rust o'rnatish
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Tauri CLI
cargo install tauri-cli

# 3. Build
cd public/os-agent/tauri-skeleton
cargo tauri dev      # dev mode
cargo tauri build    # production binary
```

## Output

- Windows: `src-tauri/target/release/ai-radar.exe` (~5MB)
- macOS: `.app` bundle
- Linux: `.AppImage`, `.deb`

## Arxitektura

```
┌──────────────────────────────────┐
│  System Tray (🛡️)               │
│  - Pauza/Davom                   │
│  - Chiqish                       │
└──────────────┬───────────────────┘
               │
       Async Tokio loop (3s)
               │
        ┌──────┴──────┐
        │  Screenshot │  (`screenshots` crate)
        │  → 768px    │
        │  → JPEG b64 │
        └──────┬──────┘
               │
        POST /analyze-image
               │
       should_block && conf>0.65
               │
        ┌──────┴──────┐
        │  Fullscreen │
        │  Blackout   │  (blackout.html)
        │  Window     │
        └─────────────┘
```

## Kvota muammosi

Hozir har screenshot cloud'ga ketadi → **3s × 30/min × 60min = 1800 chaqiriq/soat**.
Bu ko'p. Yechimlar:

1. **Lokal NSFW model** (ONNX MobileNet, ~5MB) — Rust'da `ort` crate orqali.
2. **Diff detection** — agar ekran o'zgarmagan bo'lsa, qayta yubormaslik.
3. **Window-focus check** — faqat foydalanuvchi yangi oyna ochganda tekshirish.
4. **Active app filter** — VSCode, terminal kabi xavfsiz dasturlarni o'tkazib yuborish.

## Cargo.toml namunasi

```toml
[package]
name = "ai-radar"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "1.6", features = ["api-all", "system-tray"] }
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
base64 = "0.22"
image = "0.25"
screenshots = "0.8"
chrono = "0.4"
urlencoding = "2"
anyhow = "1"

[build-dependencies]
tauri-build = { version = "1.5", features = [] }
```

## Keyingi MVP qadamlari

- [ ] `Cargo.toml` to'liq yozish va build qilish
- [ ] Lokal ONNX NSFW model integratsiyasi
- [ ] Auto-start on boot (Windows registry / Linux systemd / macOS LaunchAgent)
- [ ] Per-app whitelist (VSCode, terminal, Figma)
- [ ] Statistika dashboard (qancha bloklangan)
