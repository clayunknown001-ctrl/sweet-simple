import { BookOpen, Copy, Check } from "lucide-react";
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

const textExample = `// POST /functions/v1/analyze-text
{
  "text": "O'zbekiston — Markaziy Osiyodagi davlat..."
}

// Response
{
  "summary": "Matn O'zbekiston haqida...",
  "language": "Uzbek",
  "sentiment": "neutral",
  "sentiment_score": 0.1,
  "topics": ["geography", "culture", "history"],
  "word_count": 42,
  "reading_time_minutes": 1,
  "content_type": "article",
  "tone": "informational",
  "key_entities": ["O'zbekiston", "Markaziy Osiyo"]
}`;

const imageExample = `// POST /functions/v1/analyze-image
{
  "image_url": "https://example.com/photo.jpg"
  // or "image_base64": "base64_encoded_data..."
}

// Response
{
  "description": "A beautiful landscape with mountains...",
  "objects": ["mountain", "river", "trees"],
  "colors": ["blue", "green", "white"],
  "scene_type": "landscape",
  "mood": "serene",
  "text_detected": "",
  "quality": "high",
  "tags": ["nature", "landscape", "mountains"],
  "contains_people": false,
  "estimated_people_count": 0
}`;

const curlTextExample = `curl -X POST \\
  '${"{YOUR_SUPABASE_URL}"}/functions/v1/analyze-text' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${"{YOUR_ANON_KEY}"}' \\
  -d '{"text": "Tahlil qilinadigan matn..."}'`;

const curlImageExample = `curl -X POST \\
  '${"{YOUR_SUPABASE_URL}"}/functions/v1/analyze-image' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer ${"{YOUR_ANON_KEY}"}' \\
  -d '{"image_url": "https://example.com/image.jpg"}'`;

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-background bg-grid">
      <Navbar />
      <div className="container mx-auto pt-24 pb-12 px-4 max-w-4xl">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">
            <BookOpen className="inline w-8 h-8 text-purple mr-2" />
            API hujjatlari
          </h1>
          <p className="text-muted-foreground">AI Content Insights API ni o'z ilovangizga ulang</p>
        </div>

        {/* Overview */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            Umumiy ma'lumot
          </h2>
          <div className="bg-card border border-border rounded-xl p-6 space-y-3">
            <p className="text-foreground leading-relaxed">
              AI Content Insights ikkita asosiy endpoint taqdim etadi:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary font-mono text-sm mt-0.5">POST</span>
                <span><code className="font-mono text-sm text-primary bg-primary/10 px-1.5 py-0.5 rounded">/functions/v1/analyze-text</code> — Matn tahlili</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan font-mono text-sm mt-0.5">POST</span>
                <span><code className="font-mono text-sm text-cyan bg-cyan/10 px-1.5 py-0.5 rounded">/functions/v1/analyze-image</code> — Rasm tahlili</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Endpoints */}
        <section className="space-y-8">
          <Tabs defaultValue="text" className="w-full">
            <TabsList className="bg-muted w-full">
              <TabsTrigger value="text" className="flex-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-mono">
                analyze-text
              </TabsTrigger>
              <TabsTrigger value="image" className="flex-1 data-[state=active]:bg-cyan/10 data-[state=active]:text-cyan font-mono">
                analyze-image
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="mt-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">So'rov va javob</h3>
                <CodeBlock code={textExample} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">cURL misol</h3>
                <CodeBlock code={curlTextExample} language="bash" />
              </div>
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Javob maydonlari</h3>
                <div className="space-y-2 text-sm">
                  {[
                    ["summary", "string", "Qisqa xulosa"],
                    ["language", "string", "Aniqlangan til"],
                    ["sentiment", "string", "positive | negative | neutral | mixed"],
                    ["sentiment_score", "number", "-1 dan 1 gacha"],
                    ["topics", "string[]", "Asosiy mavzular"],
                    ["word_count", "number", "So'zlar soni"],
                    ["reading_time_minutes", "number", "O'qish vaqti (daqiqa)"],
                    ["content_type", "string", "Kontent turi"],
                    ["tone", "string", "Yozish uslubi"],
                    ["key_entities", "string[]", "Asosiy ob'ektlar"],
                  ].map(([field, type, desc]) => (
                    <div key={field} className="flex items-start gap-4 py-2 border-b border-border last:border-0">
                      <code className="font-mono text-primary text-xs bg-primary/10 px-1.5 py-0.5 rounded min-w-[160px]">{field}</code>
                      <span className="text-muted-foreground font-mono text-xs min-w-[80px]">{type}</span>
                      <span className="text-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="image" className="mt-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">So'rov va javob</h3>
                <CodeBlock code={imageExample} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">cURL misol</h3>
                <CodeBlock code={curlImageExample} language="bash" />
              </div>
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Javob maydonlari</h3>
                <div className="space-y-2 text-sm">
                  {[
                    ["description", "string", "Rasmning batafsil tavsifi"],
                    ["objects", "string[]", "Aniqlangan ob'ektlar"],
                    ["colors", "string[]", "Asosiy ranglar"],
                    ["scene_type", "string", "Sahna turi"],
                    ["mood", "string", "Kayfiyat/atmosfera"],
                    ["text_detected", "string", "Rasmdagi matn"],
                    ["quality", "string", "low | medium | high"],
                    ["tags", "string[]", "Teglar"],
                    ["contains_people", "boolean", "Odamlar bormi"],
                    ["estimated_people_count", "number", "Taxminiy odamlar soni"],
                  ].map(([field, type, desc]) => (
                    <div key={field} className="flex items-start gap-4 py-2 border-b border-border last:border-0">
                      <code className="font-mono text-cyan text-xs bg-cyan/10 px-1.5 py-0.5 rounded min-w-[200px]">{field}</code>
                      <span className="text-muted-foreground font-mono text-xs min-w-[80px]">{type}</span>
                      <span className="text-foreground">{desc}</span>
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
            Cheklovlar
          </h2>
          <div className="bg-card border border-border rounded-xl p-6 space-y-2 text-muted-foreground">
            <p><code className="font-mono text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">429</code> — Rate limit. Qayta urinib ko'ring.</p>
            <p><code className="font-mono text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">402</code> — Kredit tugadi. Hisobni to'ldiring.</p>
            <p><code className="font-mono text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">500</code> — Server xatosi.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
