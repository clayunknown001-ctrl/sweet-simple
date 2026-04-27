# AI Radar — OS Agent (Tauri/Rust) v0.3

Production-ready skeleton. Tauri 1.6 + Rust + ONNX local-first.

## v0.3 yangilanishlari

- ✅ **Haqiqiy ONNX NSFW inference** (`local-nsfw` feature, `ort` crate)
- ✅ **Windows foreground process detection** (`GetForegroundWindow` API)
- ✅ Diff detection (16x16 perceptual hash) — o'zgarmagan ekran skip
- ✅ Per-app whitelist (VSCode, Cursor, Figma, terminallar...)
- ✅ Adaptive cooldown (12s blokdan keyin)
- ✅ Auto-start on boot (`auto-launch`)
- ✅ System tray: Pauza / Statistika / Chiqish

## Build

```bash
# 1. Rust + Tauri CLI
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install tauri-cli

# 2. (ixtiyoriy) NSFW model yuklash
mkdir -p src-tauri/models
curl -L -o src-tauri/models/nsfw_mobilenet_v2.onnx \
  https://huggingface.co/AdamCodd/nsfw-image-detection/resolve/main/model.onnx

# 3a. Cloud-only build (engil, ~5MB)
cd public/os-agent/tauri-skeleton
cargo tauri build

# 3b. Local-first build (ONNX, ~15MB, 95% kredit tejaydi)
cargo tauri build -- --features local-nsfw
```

## Output

- Windows: `src-tauri/target/release/ai-radar.exe`
- macOS: `.app` bundle (LaunchAgent auto-start)
- Linux: `.AppImage`, `.deb`

## Arxitektura (3 qatlamli)

```
                ┌─────────────────────┐
                │  System Tray (🛡️)   │
                └──────────┬──────────┘
                           │
                  Async Tokio loop (3s)
                           │
            ┌──────────────┴──────────────┐
            │ 1. Whitelist app? → SKIP    │
            │ 2. Diff hash same? → SKIP   │
            │ 3. Lokal NSFW (ONNX)        │
            │    > 0.85 → BLOCK           │
            │    < 0.20 → SAFE            │
            │    oraliq → cloud           │
            │ 4. Cloud AI (analyze-image) │
            └──────────────┬──────────────┘
                           │
                  should_block && conf>0.65
                           │
                ┌──────────┴──────────┐
                │  Fullscreen Blackout│
                └─────────────────────┘
```

## Kredit tejash

| Qatlam              | Tejash |
|---------------------|--------|
| Whitelist apps      | ~30%   |
| Diff hash           | ~40%   |
| Lokal ONNX NSFW     | ~25%   |
| Cloud (qoldiq)      | ~5%    |

**Natija:** soatiga 1800 → 90 cloud chaqiruv (~95% tejash).

## Status

- [x] ONNX integratsiya (`local-nsfw` feature)
- [x] Windows foreground detection
- [x] Auto-start on boot
- [x] System tray menyu
- [ ] macOS NSWorkspace foreground (Linux: xdotool/wmctrl) — TODO
- [ ] Tauri Mobile (Android Accessibility Service)
