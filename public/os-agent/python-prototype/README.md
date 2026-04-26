# AI Radar — OS Agent (Python prototip v2)

MVP+ uchun. Windows/Linux/macOS'da ishlaydi.

## O'rnatish

```bash
pip install pillow mss requests opennsfw2 psutil pygetwindow
# Windows uchun qo'shimcha:
pip install pywin32
python agent.py
```

## Yangi v2 xususiyatlari

1. **Lokal NSFW filter** (`opennsfw2`, ONNX MobileNet, ~5MB):
   - Score > 0.85 → darhol blok (cloud kerak emas)
   - Score < 0.20 → xavfsiz (cloud kerak emas)
   - 0.20..0.85 → cloud AI'ga yuboriladi (faqat shubhalilar)
   - **Natija: cloud chaqiriqlari ~95% kamayadi**

2. **Per-app whitelist** — xavfsiz dasturlarda umuman tekshirilmaydi:
   - VSCode, Cursor, Lovable, Terminal, PowerShell, bash
   - Figma, File Explorer, Notepad, Gedit
   - Real vaqtda `psutil + win32gui` orqali aniqlanadi

3. **Diff detection** — ekran perceptual hash (16x16) bilan taqqoslanadi:
   - O'zgarmagan bo'lsa → tekshirmaslik
   - Statik sahifalarda 90%+ tejash

4. **Statistika** — har 50 iteratsiyada chiqadi:
   ```
   [STATS] cloud=12, lokal_blok=3, diff=78, whitelist=45 → kvota tejash: 91%
   ```

## Konfiguratsiya

`agent.py` ichida:
- `INTERVAL_SEC` — chastota (default 3s)
- `LOCAL_NSFW_BLOCK` / `LOCAL_NSFW_SAFE` — lokal model chegaralari
- `WHITELIST_APPS` — xavfsiz dasturlar ro'yxati

## Logika diagrammasi

```
Screenshot (3s)
    │
    ├── Whitelist app? ──► skip
    ├── Diff = oldingi? ──► skip
    ├── Lokal NSFW > 0.85? ──► BLOK (overlay)
    ├── Lokal NSFW < 0.20? ──► safe
    └── Oraliq → Cloud AI ──► Block/Allow
```

## Keyingi qadam: Tauri/Rust

Productionda `../tauri-skeleton/` — 5MB binary, 50MB RAM, system tray, auto-start.
