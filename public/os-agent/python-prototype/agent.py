"""
AI Radar — OS Agent Python prototip (v2: lokal NSFW + whitelist + diff)
========================================================================
Yangi xususiyatlar:
  - Lokal NSFW filter (opennsfw2, ONNX MobileNet) — cloud chaqiriqlarini 95% kamaytiradi
  - Per-app whitelist (VSCode, Terminal, Figma, ...) — xavfsiz dasturlar tekshirilmaydi
  - Diff detection — ekran o'zgarmagan bo'lsa, qayta yubormaslik
  - Adaptive interval — bloklangandan keyin 12s pauza

O'rnatish:
    pip install pillow mss requests opennsfw2 psutil pygetwindow
    # Windows uchun qo'shimcha:
    pip install pywin32

Ishga tushirish:
    python agent.py
"""

import base64
import io
import time
import threading
import hashlib
import requests
from mss import mss
from PIL import Image

API_URL = "https://iwyntbeqdvsbzvmskpaw.supabase.co/functions/v1/analyze-image"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eW50YmVxZHZzYnp2bXNrcGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDkyOTYsImV4cCI6MjA4ODAyNTI5Nn0.dwvan4-1Mifxo6r3WzFqxmdMiByJ63h1Jk4rkvUrc0g"

INTERVAL_SEC = 3.0
MAX_DIM = 768
LANG = "uz"

# Lokal NSFW chegaralar (opennsfw2 score 0..1)
LOCAL_NSFW_BLOCK = 0.85   # > shu — darhol blok (cloud kerak emas)
LOCAL_NSFW_SAFE = 0.20    # < shu — xavfsiz (cloud kerak emas)
# Oraliq (0.20..0.85) — cloud AI'ga yuboriladi

# Whitelist: xavfsiz process nomlar (kichik harflarda)
WHITELIST_APPS = {
    "code.exe", "code", "vscode",
    "windowsterminal.exe", "cmd.exe", "powershell.exe", "wt.exe",
    "bash", "zsh", "fish", "alacritty", "kitty", "gnome-terminal",
    "figma.exe", "figma",
    "explorer.exe", "finder",
    "lovable", "cursor.exe", "cursor",
    "notepad.exe", "gedit", "kate",
}

# --- Lokal NSFW model (lazy load) ---
_nsfw_model = None
def get_nsfw_model():
    global _nsfw_model
    if _nsfw_model is None:
        try:
            import opennsfw2 as n2
            _nsfw_model = n2
            print("[+] Lokal NSFW model yuklandi (opennsfw2)")
        except ImportError:
            print("[!] opennsfw2 o'rnatilmagan — `pip install opennsfw2` (lokal filter o'chirilgan)")
            _nsfw_model = False
    return _nsfw_model

def local_nsfw_score(pil_img: Image.Image) -> float | None:
    """0..1 oralig'ida NSFW ehtimoli. None — model yo'q."""
    n2 = get_nsfw_model()
    if not n2:
        return None
    try:
        # opennsfw2 PIL Image qabul qiladi
        score = n2.predict_image(pil_img)
        return float(score)
    except Exception as e:
        print(f"[!] Lokal NSFW xato: {e}")
        return None

# --- Active window detect ---
def active_app_name() -> str:
    """Hozirgi faol oyna process nomini qaytaradi (lower)."""
    try:
        import psutil
        try:
            import pygetwindow as gw
            w = gw.getActiveWindow()
            if not w:
                return ""
            # Title orqali process topish qiyin — PID kerak
        except Exception:
            pass
        # Windows: win32gui
        try:
            import win32gui, win32process
            hwnd = win32gui.GetForegroundWindow()
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            return psutil.Process(pid).name().lower()
        except Exception:
            pass
        # Linux/Mac: foreground topish murakkab — bo'sh qaytaramiz
        return ""
    except ImportError:
        return ""

def is_whitelisted() -> bool:
    name = active_app_name()
    if not name:
        return False
    return any(w in name for w in WHITELIST_APPS)

# --- Screenshot + diff ---
_last_hash = None
def grab_screen() -> tuple[Image.Image, str]:
    with mss() as sct:
        shot = sct.grab(sct.monitors[1])
        img = Image.frombytes("RGB", shot.size, shot.rgb)
    img.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
    # Perceptual hash (oddiy: 16x16 grayscale)
    small = img.resize((16, 16)).convert("L")
    h = hashlib.md5(small.tobytes()).hexdigest()
    return img, h

def img_to_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    return base64.b64encode(buf.getvalue()).decode("ascii")

# --- Cloud API ---
def analyze_cloud(b64: str) -> dict:
    try:
        r = requests.post(
            API_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {ANON_KEY}",
                "apikey": ANON_KEY,
            },
            json={"image_base64": b64, "fast": True, "language": LANG},
            timeout=15,
        )
        if r.status_code in (402, 429):
            print(f"[!] Quota: {r.status_code} — pause 60s")
            time.sleep(60)
            return {"should_block": False}
        return r.json()
    except Exception as e:
        print(f"[!] API error: {e}")
        return {"should_block": False}

# --- Overlay ---
def show_overlay(reason: str):
    try:
        import tkinter as tk
        root = tk.Tk()
        root.attributes("-fullscreen", True)
        root.attributes("-topmost", True)
        root.configure(bg="#0f172a")
        tk.Label(root, text="🛡️", font=("Arial", 80), fg="#ef4444", bg="#0f172a").pack(pady=80)
        tk.Label(root, text="AI Radar bloklandi", font=("Arial", 28, "bold"), fg="#fff", bg="#0f172a").pack()
        tk.Label(root, text=reason[:200], font=("Arial", 16), fg="#94a3b8", bg="#0f172a",
                 wraplength=600, justify="center").pack(pady=20)
        tk.Button(root, text="Davom etish (10s kutish)", font=("Arial", 14),
                  command=root.destroy, bg="#1e293b", fg="#fff").pack(pady=40)
        root.after(10_000, root.destroy)
        root.mainloop()
    except Exception as e:
        print(f"[!] Overlay xato: {e}")

# --- Asosiy loop ---
def main():
    global _last_hash
    print(f"[AI Radar OS Agent v2] Boshlandi. Har {INTERVAL_SEC}s ekran tekshirilmoqda...")
    print(f"[+] Lokal NSFW: blok>{LOCAL_NSFW_BLOCK}, xavfsiz<{LOCAL_NSFW_SAFE}, oraliq → cloud")
    print(f"[+] Whitelist apps: {len(WHITELIST_APPS)} ta")
    cloud_calls = 0
    local_blocks = 0
    skipped_diff = 0
    skipped_white = 0

    while True:
        try:
            # 1. Whitelist check (eng tez)
            if is_whitelisted():
                skipped_white += 1
                print("w", end="", flush=True)
                time.sleep(INTERVAL_SEC)
                continue

            # 2. Screenshot + diff
            img, h = grab_screen()
            if h == _last_hash:
                skipped_diff += 1
                print("=", end="", flush=True)
                time.sleep(INTERVAL_SEC)
                continue
            _last_hash = h

            # 3. Lokal NSFW filter
            score = local_nsfw_score(img)
            if score is not None:
                if score >= LOCAL_NSFW_BLOCK:
                    local_blocks += 1
                    reason = f"Lokal NSFW aniqlandi (score={score:.2f})"
                    print(f"\n[LOCAL BLOCK] {reason}")
                    threading.Thread(target=show_overlay, args=(reason,), daemon=False).start()
                    time.sleep(12)
                    continue
                if score <= LOCAL_NSFW_SAFE:
                    print(".", end="", flush=True)
                    time.sleep(INTERVAL_SEC)
                    continue
                # oraliq → cloud

            # 4. Cloud AI
            cloud_calls += 1
            b64 = img_to_b64(img)
            result = analyze_cloud(b64)
            if result.get("should_block"):
                reason = result.get("block_reason", "Zararli kontent")
                conf = result.get("confidence", 0)
                print(f"\n[CLOUD BLOCK] {reason} (conf={conf:.2f})")
                threading.Thread(target=show_overlay, args=(reason,), daemon=False).start()
                time.sleep(12)
            else:
                print("c", end="", flush=True)

            # Statistika har 50 iteratsiyada
            if (cloud_calls + local_blocks + skipped_diff + skipped_white) % 50 == 0:
                total = cloud_calls + local_blocks + skipped_diff + skipped_white
                saved = (1 - cloud_calls / max(total, 1)) * 100
                print(f"\n[STATS] cloud={cloud_calls}, lokal_blok={local_blocks}, "
                      f"diff={skipped_diff}, whitelist={skipped_white} → kvota tejash: {saved:.0f}%")

        except KeyboardInterrupt:
            print("\n[exit]")
            break
        except Exception as e:
            print(f"\n[!] Loop error: {e}")
        time.sleep(INTERVAL_SEC)

if __name__ == "__main__":
    main()
