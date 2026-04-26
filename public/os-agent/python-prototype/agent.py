"""
AI Radar — OS Agent Python prototip
====================================
Bu skript Windows/Linux/macOS'da har 3 soniyada ekran screenshot oladi,
Supabase edge function'ga yuboradi va xavfli kontent topilsa qora overlay ko'rsatadi.

O'rnatish:
    pip install pillow mss requests pystray

Ishga tushirish:
    python agent.py

MVP uchun ideal: keyinchalik Tauri/Rust'ga ko'chiriladi (5MB binary, 50MB RAM).
"""

import base64
import io
import time
import threading
import requests
from mss import mss
from PIL import Image

API_URL = "https://iwyntbeqdvsbzvmskpaw.supabase.co/functions/v1/analyze-image"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eW50YmVxZHZzYnp2bXNrcGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDkyOTYsImV4cCI6MjA4ODAyNTI5Nn0.dwvan4-1Mifxo6r3WzFqxmdMiByJ63h1Jk4rkvUrc0g"

INTERVAL_SEC = 3.0
MAX_DIM = 768  # downscale qilamiz — bandwidth tejash + tezroq AI
LANG = "uz"

def grab_screen_b64() -> str:
    with mss() as sct:
        shot = sct.grab(sct.monitors[1])  # primary monitor
        img = Image.frombytes("RGB", shot.size, shot.rgb)
    img.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    return base64.b64encode(buf.getvalue()).decode("ascii")

def analyze(b64: str) -> dict:
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

def show_overlay(reason: str):
    """Tkinter orqali to'liq ekranli qora overlay ko'rsatish."""
    try:
        import tkinter as tk
        root = tk.Tk()
        root.attributes("-fullscreen", True)
        root.attributes("-topmost", True)
        root.configure(bg="#0f172a")
        tk.Label(
            root, text="🛡️", font=("Arial", 80), fg="#ef4444", bg="#0f172a"
        ).pack(pady=80)
        tk.Label(
            root, text="AI Radar bloklandi",
            font=("Arial", 28, "bold"), fg="#fff", bg="#0f172a",
        ).pack()
        tk.Label(
            root, text=reason[:200], font=("Arial", 16), fg="#94a3b8", bg="#0f172a",
            wraplength=600, justify="center",
        ).pack(pady=20)
        tk.Button(
            root, text="Davom etish (10s kutish)", font=("Arial", 14),
            command=root.destroy, bg="#1e293b", fg="#fff",
        ).pack(pady=40)
        root.after(10_000, root.destroy)  # 10s majburiy kutish
        root.mainloop()
    except Exception as e:
        print(f"[!] Overlay xato: {e}")

def main():
    print(f"[AI Radar OS Agent] Boshlandi. Har {INTERVAL_SEC}s ekran tekshirilmoqda...")
    while True:
        try:
            b64 = grab_screen_b64()
            result = analyze(b64)
            if result.get("should_block"):
                reason = result.get("block_reason", "Zararli kontent")
                conf = result.get("confidence", 0)
                print(f"[BLOCK] {reason} (conf={conf:.2f})")
                threading.Thread(
                    target=show_overlay, args=(reason,), daemon=False
                ).start()
                time.sleep(12)  # overlay ko'rinib turgan paytda ortiqcha so'rov yo'q
            else:
                print(".", end="", flush=True)
        except KeyboardInterrupt:
            print("\n[exit]")
            break
        except Exception as e:
            print(f"[!] Loop error: {e}")
        time.sleep(INTERVAL_SEC)

if __name__ == "__main__":
    main()
