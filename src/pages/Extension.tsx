import { Download, Shield, Chrome, CheckCircle2, AlertCircle, Eye, Code2, Cpu } from "lucide-react";
import Navbar from "@/components/Navbar";

export default function Extension() {
  return (
    <div className="min-h-screen bg-background bg-grid">
      <Navbar />
      <section className="container mx-auto pt-28 pb-16 px-4 max-w-4xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm font-mono mb-6">
            <Shield className="w-4 h-4" />
            Real-time Browser Shield
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            <span className="text-foreground">AI Radar </span>
            <span className="text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.5)]">
              Brauzer Kengaytmasi
            </span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Pinterest, Instagram, Facebook — har qanday saytdagi har bir rasm va videoni
            avtomatik kuzatadi va zararli kontentni darhol bloklaydi. Yo'l radari kabi —
            doimiy faol.
          </p>
        </div>

        {/* Yuklab olish */}
        <div className="rounded-2xl border border-primary/30 bg-card p-8 mb-10 glow-primary">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Download className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">1-qadam: Yuklab olish</h2>
              <p className="text-muted-foreground text-sm">
                Kengaytmani ZIP fayl ko'rinishida yuklab oling
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              fetch("/ai-radar-extension.zip")
                .then((res) => {
                  if (!res.ok) throw new Error(`Yuklab olishda xatolik: ${res.status}`);
                  return res.blob();
                })
                .then((blob) => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "ai-radar-extension.zip";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(a.href);
                })
                .catch((err) => alert(err.message));
            }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-mono font-bold hover:opacity-90 transition-opacity"
          >
            <Download className="w-5 h-5" />
            ai-radar-extension.zip
          </button>
        </div>

        {/* O'rnatish */}
        <div className="rounded-2xl border border-border bg-card p-8 mb-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 rounded-xl bg-cyan/10 text-cyan">
              <Chrome className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">2-qadam: Chrome'ga o'rnatish</h2>
              <p className="text-muted-foreground text-sm">
                Edge, Brave, Opera ham mos keladi
              </p>
            </div>
          </div>
          <ol className="space-y-4 font-mono text-sm">
            <li className="flex gap-3">
              <span className="text-primary font-bold">01.</span>
              <span className="text-foreground">
                ZIP faylni <span className="text-primary">archivedan chiqaring</span> (right-click → Extract / Ochish)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary font-bold">02.</span>
              <span className="text-foreground">
                Brauzeringizda{" "}
                <code className="px-2 py-0.5 rounded bg-muted text-primary">chrome://extensions</code>{" "}
                manzilini oching
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary font-bold">03.</span>
              <span className="text-foreground">
                Yuqori-o'ng burchakdagi{" "}
                <span className="text-cyan">"Developer mode"</span> (Dasturchi rejimi) ni yoqing
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary font-bold">04.</span>
              <span className="text-foreground">
                <span className="text-cyan">"Load unpacked"</span> (Paketlanmagan yuklash) tugmasini bosing
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary font-bold">05.</span>
              <span className="text-foreground">
                Chiqarilgan <span className="text-primary">ai-radar-extension</span> papkasini tanlang
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-primary font-bold">06.</span>
              <span className="text-foreground">
                Tayyor! Endi har qanday saytni oching — radar avtomatik faollashadi 🛡️
              </span>
            </li>
          </ol>
        </div>

        {/* Sinash */}
        <div className="rounded-2xl border border-border bg-card p-8 mb-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Eye className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">3-qadam: Sinash</h2>
              <p className="text-muted-foreground text-sm">
                Pinterest yoki Instagram'ni oching
              </p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                <span className="text-foreground font-bold">pinterest.com</span> ga kiring va
                "bikini" yoki "beach" qidiring — barcha behayo rasmlar 🛡️ qalqon bilan yopiladi.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                <span className="text-foreground font-bold">instagram.com</span> reels'larni
                scroll qilganingizda zararli videolar avtomatik to'xtatiladi.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <p className="text-muted-foreground">
                Brauzer DevTools (F12) → Console'da{" "}
                <code className="px-1.5 py-0.5 rounded bg-muted text-primary">[AI Radar] 🛡️ Faol</code>{" "}
                yozuvini ko'rasiz.
              </p>
            </div>
          </div>
        </div>

        {/* Eslatma */}
        <div className="rounded-2xl border border-cyan/30 bg-cyan/5 p-6 mb-10">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-cyan shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-foreground font-bold mb-1">Texnik ma'lumot</p>
              <p className="text-muted-foreground">
                Kengaytma har bir ko'rinadigan rasm/videoni Lovable Cloud orqali Gemini 2.5 Flash
                AI'ga yuboradi. AI 4-bosqichli neyropsixologik mantiq bilan tahlil qiladi va
                1% shubha bo'lsa ham bloklaydi.
              </p>
            </div>
          </div>
        </div>

        {/* === BRAUZER ISHLAB CHIQUVCHILARI UCHUN === */}
        <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/5 to-cyan/5 p-8 mb-10 glow-primary">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Cpu className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                🚀 O'z brauzeringizga o'rnatish
              </h2>
              <p className="text-muted-foreground text-sm">
                Brauzer ishlab chiquvchilari uchun — har bir foydalanuvchi alohida
                kengaytma yuklamasin
              </p>
            </div>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Agar siz <span className="text-primary font-bold">o'z brauzeringizni</span> (Electron,
            Chromium fork, CEF) yaratayotgan bo'lsangiz, AI Radar'ni{" "}
            <span className="text-cyan font-bold">brauzeringiz ichiga o'rnatilgan funksiya</span>{" "}
            sifatida qo'shing. Shunda har bir foydalanuvchi avtomatik himoyalanadi —
            qo'shimcha kengaytma o'rnatish shart emas.
          </p>

          <div className="rounded-lg border border-border bg-background/60 p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Code2 className="w-4 h-4 text-primary" />
              <span className="font-mono font-bold text-foreground">monitor.js</span>
              <span className="text-xs text-muted-foreground">— universal kuzatuv skripti</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Bu skriptni har bir yangi tab ochilganda avtomatik inject qiling.
              U barcha rasm/videolarni kuzatadi va AI orqali bloklaydi.
            </p>
            <button
              onClick={() => {
                fetch("/monitor.js")
                  .then((res) => res.blob())
                  .then((blob) => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "monitor.js";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(a.href);
                  });
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-mono text-sm font-bold hover:opacity-90"
            >
              <Download className="w-4 h-4" />
              monitor.js yuklab olish
            </button>
          </div>

          <h3 className="text-foreground font-bold mb-3 font-mono">
            Integratsiya misollari:
          </h3>

          <div className="rounded-lg border border-border bg-background/60 p-4 mb-3">
            <div className="font-mono text-sm font-bold text-cyan mb-2">⚡ Electron brauzer</div>
            <pre className="text-xs font-mono text-muted-foreground overflow-x-auto bg-muted/30 p-3 rounded">
{`// main.js — har bir BrowserWindow uchun
win.webContents.on('did-finish-load', () => {
  const fs = require('fs');
  const monitorJs = fs.readFileSync('./monitor.js', 'utf8');
  win.webContents.executeJavaScript(monitorJs);
});`}
            </pre>
          </div>

          <div className="rounded-lg border border-border bg-background/60 p-4 mb-3">
            <div className="font-mono text-sm font-bold text-cyan mb-2">🔧 Chromium fork (C++)</div>
            <pre className="text-xs font-mono text-muted-foreground overflow-x-auto bg-muted/30 p-3 rounded">
{`// content/renderer/render_frame_impl.cc
// DidFinishLoad() ichida:
std::string script = ReadFile("ai_radar/monitor.js");
frame_->ExecuteScript(WebScriptSource(
  WebString::FromUTF8(script)
));`}
            </pre>
          </div>

          <div className="rounded-lg border border-border bg-background/60 p-4 mb-3">
            <div className="font-mono text-sm font-bold text-cyan mb-2">
              🧩 CEF (Chromium Embedded Framework)
            </div>
            <pre className="text-xs font-mono text-muted-foreground overflow-x-auto bg-muted/30 p-3 rounded">
{`// CefLoadHandler::OnLoadEnd
void OnLoadEnd(CefRefPtr<CefBrowser> browser,
               CefRefPtr<CefFrame> frame, int code) {
  frame->ExecuteJavaScript(monitor_js, frame->GetURL(), 0);
}`}
            </pre>
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="font-mono text-sm font-bold text-primary mb-2">
              🌐 API endpoint (ishlamoqda)
            </div>
            <pre className="text-xs font-mono text-muted-foreground overflow-x-auto bg-muted/30 p-3 rounded">
{`POST https://iwyntbeqdvsbzvmskpaw.supabase.co
       /functions/v1/analyze-image

Body: { "image_url": "...", "fast": true, "language": "uz" }
Response: { "should_block": true, "block_reason": "..." }`}
            </pre>
            <p className="text-xs text-muted-foreground mt-2">
              💡 Hech qanday API kalit shart emas — public anon key{" "}
              <span className="text-primary">monitor.js</span> ichida. Cheksiz so'rov, bepul.
            </p>
          </div>

          <div className="mt-6 p-4 rounded-lg border border-cyan/30 bg-cyan/5">
            <p className="text-sm text-muted-foreground">
              <span className="text-cyan font-bold">Natija:</span> Sizning brauzeringizni
              yuklab olgan har bir foydalanuvchi avtomatik AI himoyasi ostida bo'ladi.
              Hech qanday sozlash, hech qanday extension — sof native tajriba.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
