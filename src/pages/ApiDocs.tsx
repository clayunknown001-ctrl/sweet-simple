import { BookOpen, Copy, Check, Shield, ShieldAlert } from "lucide-react";
import { useState } from "react";
import Navbar from "@/components/Navbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function CodeBlock({ code, language = "json" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono text-foreground border border-border">
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 p-1.5 rounded-md bg-background/80 border border-border opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
      </button>
    </div>
  );
}

const BASE_URL = "https://iwyntbeqdvsbzvmskpaw.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3eW50YmVxZHZzYnp2bXNrcGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDkyOTYsImV4cCI6MjA4ODAyNTI5Nn0.dwvan4-1Mifxo6r3WzFqxmdMiByJ63h1Jk4rkvUrc0g";

const quickStartJS = `// 🔧 Brauzer integratsiyasi uchun tayyor kod
const BASE_URL = "${BASE_URL}";
const API_KEY = "${ANON_KEY}";

// Umumiy so'rov funksiyasi
async function analyzeContent(endpoint, body) {
  const res = await fetch(\`\${BASE_URL}/functions/v1/\${endpoint}\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer \${API_KEY}\`
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

// ✅ Matnni tekshirish
async function checkText(text) {
  const result = await analyzeContent("analyze-text", { text, language: "uz" });
  if (result.should_block) {
    console.log("⛔ BLOKLANDI:", result.block_reason);
    return false; // bloklash
  }
  return true; // ruxsat
}

// ✅ Rasmni tekshirish (URL orqali)
async function checkImageURL(url) {
  const result = await analyzeContent("analyze-image", { image_url: url, language: "uz" });
  if (result.should_block) {
    console.log("⛔ BLOKLANDI:", result.block_reason);
    return false;
  }
  return true;
}

// ✅ Rasmni tekshirish (base64 orqali)
async function checkImageBase64(base64Data) {
  const result = await analyzeContent("analyze-image", { image_base64: base64Data, language: "uz" });
  return !result.should_block;
}

// ✅ Videoni tekshirish (base64, max 15MB)
async function checkVideo(videoBase64, mimeType = "video/mp4") {
  const result = await analyzeContent("analyze-video", {
    video_base64: videoBase64,
    mime_type: mimeType,
    language: "uz"
  });
  return !result.should_block;
}`;

const browserExtensionExample = `// 🌐 Chrome/DuckDuckGo Extension - content.js
// Sahifadagi rasmlarni skanerlash va bloklash

const BASE_URL = "${BASE_URL}";
const API_KEY = "${ANON_KEY}";

// Rasmni base64 ga o'girish
function imageToBase64(img) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const dataURL = canvas.toDataURL("image/jpeg", 0.7);
    resolve(dataURL.split(",")[1]); // faqat base64 qism
  });
}

// Bitta rasmni tekshirish
async function scanImage(img) {
  try {
    const base64 = await imageToBase64(img);
    const res = await fetch(\`\${BASE_URL}/functions/v1/analyze-image\`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${API_KEY}\`
      },
      body: JSON.stringify({ image_base64: base64, language: "uz" })
    });
    const result = await res.json();
    if (result.should_block) {
      // Rasmni bloklash - qora ekran bilan almashtirish
      img.style.filter = "blur(30px)";
      img.title = "⛔ Bloklangan: " + result.block_reason;
      console.log("⛔ Rasm bloklandi:", result.block_reason);
    }
  } catch (e) {
    console.error("Skanerlash xatosi:", e);
  }
}

// Sahifadagi barcha rasmlarni skanerlash
async function scanPage() {
  const images = document.querySelectorAll("img");
  for (const img of images) {
    if (img.complete && img.naturalWidth > 100) {
      await scanImage(img);
    }
  }
}

// Sahifa yuklanganda va yangi kontent qo'shilganda skanerlash
scanPage();
const observer = new MutationObserver(() => scanPage());
observer.observe(document.body, { childList: true, subtree: true });`;

const responseExample = `// Barcha endpointlar ushbu umumiy maydonlarni qaytaradi:
{
  // ... tahlil natijalari ...
  
  // 🛡️ Xavfsizlik natijalari (ASOSIY):
  "harmful_content": {
    "is_harmful": true,
    "severity": "high",        // none | low | medium | high | critical
    "categories": ["profanity", "sexual"],
    "details": "Matnda haqoratli so'zlar aniqlandi..."
  },
  "should_block": true,        // ← BU ASOSIY MAYDON
  "block_reason": "Haqoratli va nojo'ya kontent aniqlandi"
}

// Brauzerda faqat shu 2 maydonni tekshiring:
// ✅ should_block === true → BLOKLANG
// ✅ should_block === false → RUXSAT BERING`;

const curlTextExample = `curl -X POST \\
  '${BASE_URL}/functions/v1/analyze-text' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${ANON_KEY}' \\
  -d '{"text": "Tekshiriladigan matn...", "language": "uz"}'`;

const curlImageExample = `curl -X POST \\
  '${BASE_URL}/functions/v1/analyze-image' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${ANON_KEY}' \\
  -d '{"image_url": "https://example.com/image.jpg", "language": "uz"}'`;

const curlVideoExample = `curl -X POST \\
  '${BASE_URL}/functions/v1/analyze-video' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${ANON_KEY}' \\
  -d '{"video_base64": "...", "mime_type": "video/mp4", "language": "uz"}'`;

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-background bg-grid">
      <Navbar />
      <div className="container mx-auto pt-24 pb-12 px-4 max-w-4xl">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">
            <BookOpen className="inline w-8 h-8 text-primary mr-2" />
            API hujjatlari — Brauzer integratsiyasi
          </h1>
          <p className="text-muted-foreground">Kontentni AI bilan tahlil qiling va zararli kontentni bloklang</p>
        </div>

        {/* Quick Start */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Tezkor boshlash
          </h2>
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <p className="text-foreground">
              API 3 ta endpoint taqdim etadi. Har biri <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">should_block</code> maydonini qaytaradi:
            </p>
            <div className="grid gap-3">
              {[
                { method: "POST", path: "/functions/v1/analyze-text", desc: "Matn moderatsiyasi", color: "text-primary" },
                { method: "POST", path: "/functions/v1/analyze-image", desc: "Rasm moderatsiyasi", color: "text-cyan" },
                { method: "POST", path: "/functions/v1/analyze-video", desc: "Video moderatsiyasi", color: "text-primary" },
              ].map((e) => (
                <div key={e.path} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <span className={`font-mono text-sm font-bold ${e.color}`}>{e.method}</span>
                  <code className="font-mono text-sm text-foreground">{e.path}</code>
                  <span className="text-muted-foreground text-sm ml-auto">{e.desc}</span>
                </div>
              ))}
            </div>
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-sm text-foreground">
                <strong>🔑 Autentifikatsiya:</strong> Har bir so'rovga <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">Authorization: Bearer {"{API_KEY}"}</code> header qo'shing.
              </p>
              <p className="text-sm text-foreground mt-1">
                <strong>🌐 Til:</strong> <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">language</code> parametri: <code className="font-mono text-xs">"uz"</code>, <code className="font-mono text-xs">"en"</code>, <code className="font-mono text-xs">"ru"</code>
              </p>
            </div>
          </div>
        </section>

        {/* Response format */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            Javob formati — Bloklash qarorlari
          </h2>
          <CodeBlock code={responseExample} />
        </section>

        {/* Code Examples */}
        <section className="mb-12 space-y-8">
          <Tabs defaultValue="js" className="w-full">
            <TabsList className="bg-muted w-full">
              <TabsTrigger value="js" className="flex-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-mono">
                JavaScript
              </TabsTrigger>
              <TabsTrigger value="extension" className="flex-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-mono">
                Browser Extension
              </TabsTrigger>
              <TabsTrigger value="curl" className="flex-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-mono">
                cURL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="js" className="mt-6 space-y-4">
              <h3 className="text-lg font-semibold text-foreground">JavaScript — To'liq integratsiya kodi</h3>
              <CodeBlock code={quickStartJS} language="javascript" />
            </TabsContent>

            <TabsContent value="extension" className="mt-6 space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Chrome/DuckDuckGo Extension — Rasmlarni skanerlash</h3>
              <p className="text-sm text-muted-foreground">Bu kodni brauzer extension'ingizning <code className="font-mono text-primary">content.js</code> fayliga qo'shing:</p>
              <CodeBlock code={browserExtensionExample} language="javascript" />
            </TabsContent>

            <TabsContent value="curl" className="mt-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">Matn tahlili</h3>
                <CodeBlock code={curlTextExample} language="bash" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">Rasm tahlili</h3>
                <CodeBlock code={curlImageExample} language="bash" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">Video tahlili</h3>
                <CodeBlock code={curlVideoExample} language="bash" />
              </div>
            </TabsContent>
          </Tabs>
        </section>

        {/* Endpoints detail */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-4">Endpoint parametrlari</h2>
          <Tabs defaultValue="text" className="w-full">
            <TabsList className="bg-muted w-full">
              <TabsTrigger value="text" className="flex-1 font-mono">analyze-text</TabsTrigger>
              <TabsTrigger value="image" className="flex-1 font-mono">analyze-image</TabsTrigger>
              <TabsTrigger value="video" className="flex-1 font-mono">analyze-video</TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="mt-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="font-semibold mb-3">So'rov parametrlari</h3>
                <div className="space-y-2 text-sm">
                  {[
                    ["text", "string", "✅ Majburiy", "Tahlil qilinadigan matn"],
                    ["language", "string", "Ixtiyoriy", '"uz" | "en" | "ru" (default: "en")'],
                  ].map(([f, t, r, d]) => (
                    <div key={f} className="flex gap-4 py-2 border-b border-border last:border-0">
                      <code className="font-mono text-primary text-xs bg-primary/10 px-1.5 py-0.5 rounded min-w-[100px]">{f}</code>
                      <span className="text-muted-foreground font-mono text-xs min-w-[60px]">{t}</span>
                      <span className="text-xs text-muted-foreground min-w-[80px]">{r}</span>
                      <span className="text-foreground">{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="image" className="mt-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="font-semibold mb-3">So'rov parametrlari</h3>
                <div className="space-y-2 text-sm">
                  {[
                    ["image_url", "string", "Biri kerak", "Rasm URL manzili"],
                    ["image_base64", "string", "Biri kerak", "Rasm base64 formatda"],
                    ["language", "string", "Ixtiyoriy", '"uz" | "en" | "ru"'],
                  ].map(([f, t, r, d]) => (
                    <div key={f} className="flex gap-4 py-2 border-b border-border last:border-0">
                      <code className="font-mono text-cyan text-xs bg-cyan/10 px-1.5 py-0.5 rounded min-w-[120px]">{f}</code>
                      <span className="text-muted-foreground font-mono text-xs min-w-[60px]">{t}</span>
                      <span className="text-xs text-muted-foreground min-w-[80px]">{r}</span>
                      <span className="text-foreground">{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="video" className="mt-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="font-semibold mb-3">So'rov parametrlari</h3>
                <div className="space-y-2 text-sm">
                  {[
                    ["video_base64", "string", "✅ Majburiy", "Video base64 formatda (max 15MB)"],
                    ["mime_type", "string", "Ixtiyoriy", '"video/mp4" (default)'],
                    ["language", "string", "Ixtiyoriy", '"uz" | "en" | "ru"'],
                  ].map(([f, t, r, d]) => (
                    <div key={f} className="flex gap-4 py-2 border-b border-border last:border-0">
                      <code className="font-mono text-primary text-xs bg-primary/10 px-1.5 py-0.5 rounded min-w-[120px]">{f}</code>
                      <span className="text-muted-foreground font-mono text-xs min-w-[60px]">{t}</span>
                      <span className="text-xs text-muted-foreground min-w-[80px]">{r}</span>
                      <span className="text-foreground">{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </section>

        {/* Rate Limits */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-destructive" />
            Cheklovlar va xatolar
          </h2>
          <div className="bg-card border border-border rounded-xl p-6 space-y-2 text-muted-foreground">
            <p><code className="font-mono text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">429</code> — Rate limit. Biroz kutib qayta urinib ko'ring.</p>
            <p><code className="font-mono text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">402</code> — Kredit tugadi.</p>
            <p><code className="font-mono text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">400</code> — Noto'g'ri so'rov (parametr xatosi).</p>
            <p><code className="font-mono text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">500</code> — Server xatosi.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
