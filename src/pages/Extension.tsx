import { Download, Shield, Chrome, CheckCircle2, AlertCircle, Eye } from "lucide-react";
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
        <div className="rounded-2xl border border-cyan/30 bg-cyan/5 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-cyan shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-foreground font-bold mb-1">Texnik ma'lumot</p>
              <p className="text-muted-foreground">
                Kengaytma har bir ko'rinadigan rasm/videoni Lovable Cloud orqali Gemini 2.5 Flash
                AI'ga yuboradi. AI 4-bosqichli neyropsixologik mantiq bilan tahlil qiladi va
                1% shubha bo'lsa ham bloklaydi. Tezkor rejim — har bir element 0.5-2 soniyada
                tekshiriladi.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
