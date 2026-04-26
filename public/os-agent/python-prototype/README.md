# AI Radar — OS Agent (Python prototip)

MVP uchun tezkor prototip. Windows/Linux/macOS'da ishlaydi.

## O'rnatish

```bash
pip install pillow mss requests
python agent.py
```

## Nima qiladi

1. Har **3 soniyada** birlamchi monitor screenshot oladi.
2. Rasmni 768px gacha kichraytiradi (bandwidth tejash).
3. Lovable Cloud `analyze-image` API'siga yuboradi.
4. `should_block: true` bo'lsa — to'liq ekranli qora overlay ko'rsatib, 10s kuttiradi.

## Konfiguratsiya

`agent.py` ichida:
- `INTERVAL_SEC` — tekshirish chastotasi (default 3s)
- `MAX_DIM` — yuborish oldidan downscale o'lchami (default 768px)
- `LANG` — `uz`/`ru`/`en`

## Keyingi qadam: Tauri/Rust portatsiyasi

Python prototipi MVP uchun. Productionda **Tauri (Rust)** tavsiya etiladi:
- 5MB binary (Python+deps 100MB+)
- 50MB RAM (Python ~150MB)
- System tray ikonka
- Auto-start on boot
- Native overlay (tezroq Tkinter'dan)

`../tauri-skeleton/` papkasiga qarang.

## Kvota optimizatsiyasi

Lokal NSFW model (NSFWJS Python porti yoki ONNX MobileNet) qo'shilsa,
cloud chaqiriqlari 95% kamayadi. Hozircha har screenshot cloud'ga ketadi —
faqat MVP uchun.
