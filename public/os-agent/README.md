# AI Radar — OS Integration API

Bu hujjat AI Radar'ni operatsion tizim darajasida (Windows/Linux/macOS/Android) ulash uchun.

## Arxitektura

```
┌─────────────────────────────────┐
│  OS Agent (Tauri / Electron)    │
│  - Ekran screenshot har 2s      │
│  - System tray ikonka           │
│  - Auto-start                   │
└──────────────┬──────────────────┘
               │ HTTPS (REST)
               ↓
┌─────────────────────────────────┐
│  AI Radar API (this project)    │
│  POST /functions/v1/analyze-... │
└─────────────────────────────────┘
```

## API Endpoints

### `POST /functions/v1/analyze-image`

**Request:**
```json
{
  "image_base64": "iVBORw0KGgoAAAANSUhEU...",
  "fast": true,
  "language": "uz"
}
```

**Response:**
```json
{
  "should_block": true,
  "block_reason": "Bikini, suggestive pose",
  "confidence": 0.87,
  "category": "sexual"
}
```

### `POST /functions/v1/analyze-video`

Xuddi shunday, `video_base64` parametri bilan.

## OS Agent Recommended Stack

**Eng yaxshi tanlov: Tauri (Rust + WebView)**
- Ramz: 5MB (Electron'dan 50x kichik)
- Xotira: 50MB (Electron 200MB)
- Cross-platform: Windows, macOS, Linux
- Android uchun: alohida Tauri Mobile

**Pseudo-code (Rust/Tauri):**
```rust
use std::time::Duration;
use std::thread;

fn capture_and_analyze() {
    let screenshot = capture_screen(); // PNG bytes
    let b64 = base64::encode(&screenshot);
    let resp = reqwest::blocking::Client::new()
        .post("https://iwyntbeqdvsbzvmskpaw.supabase.co/functions/v1/analyze-image")
        .json(&json!({ "image_base64": b64, "fast": true, "language": "uz" }))
        .send()?;
    let result: BlockResult = resp.json()?;
    if result.should_block {
        show_blackout_overlay(&result.block_reason);
    }
}

fn main() {
    loop {
        capture_and_analyze();
        thread::sleep(Duration::from_secs(2));
    }
}
```

## Android Integration (kelajak)

Android Accessibility Service yoki MediaProjection API orqali ekran kuzatish.
LineageOS fork qilib, system-level service sifatida o'rnatish.

## Performance va kvota

| Mode | Frequency | Daily calls |
|------|-----------|-------------|
| Light | 5s | 17,280 |
| Normal | 2s | 43,200 |
| Aggressive | 0.5s | 172,800 |

**Tavsiya**: Lokal model (NSFWJS yoki o'xshash) bilan birinchi filter qilib, faqat shubhalilarni cloud'ga yuborish — kvotani 95% kamaytiradi.

## Xavfsizlik

- API endpoint public, lekin rate-limited
- Foydalanuvchi screenshot'lari saqlanmaydi (faqat tahlil qilinadi)
- HTTPS shart
- Kelajakda: per-user auth token
