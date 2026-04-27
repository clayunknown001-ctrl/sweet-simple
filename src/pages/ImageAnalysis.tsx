import { useState, useRef } from "react";
import { Image as ImageIcon, Upload, Loader2, Palette, Eye, Tag, Users, Sparkles, Link as LinkIcon, ShieldAlert, AlertTriangle } from "lucide-react";
import Navbar from "@/components/Navbar";
import AnalysisCard from "@/components/AnalysisCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface HarmfulContent {
  is_harmful: boolean;
  severity: string;
  categories: string[];
  details: string;
}

interface ImageResult {
  description: string;
  objects: string[];
  colors: string[];
  scene_type: string;
  mood: string;
  text_detected: string;
  quality: string;
  tags: string[];
  contains_people: boolean;
  estimated_people_count: number;
  harmful_content: HarmfulContent;
  should_block?: boolean;
  block_reason?: string;
  _provider?: string;
}

const languages = [
  { code: "uz", label: "O'zbek" },
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
];

export default function ImageAnalysis() {
  const [result, setResult] = useState<ImageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [previewSrc, setPreviewSrc] = useState("");
  const [language, setLanguage] = useState("uz");
  const [lastPayload, setLastPayload] = useState<{ image_url?: string; image_base64?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const analyzeImage = async (payload: { image_url?: string; image_base64?: string }, lang?: string) => {
    setLastPayload(payload);
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-image", {
        body: { ...payload, language: lang || language },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e: any) {
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleUrlAnalyze = () => {
    if (!imageUrl.trim()) {
      toast({ title: "URL kiriting", variant: "destructive" });
      return;
    }
    setPreviewSrc(imageUrl);
    analyzeImage({ image_url: imageUrl });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Faqat rasm fayllarini yuklang", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setPreviewSrc(reader.result as string);
      analyzeImage({ image_base64: base64 });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-background bg-grid">
      <Navbar />
      <div className="container mx-auto pt-24 pb-12 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            <ImageIcon className="inline w-8 h-8 text-cyan mr-2" />
            Rasm tahlili
          </h1>
          <p className="text-muted-foreground">Rasmni yuklang yoki URL kiriting</p>
          <div className="flex gap-2 mt-3">
            {languages.map((l) => (
              <Button
                key={l.code}
                size="sm"
                variant={language === l.code ? "default" : "outline"}
                onClick={() => {
                  setLanguage(l.code);
                  if (lastPayload) analyzeImage(lastPayload, l.code);
                }}
                className={language === l.code ? "" : "text-muted-foreground"}
              >
                {l.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input */}
          <div className="space-y-4">
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="bg-muted w-full">
                <TabsTrigger value="upload" className="flex-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                  <Upload className="w-4 h-4 mr-2" />
                  Yuklash
                </TabsTrigger>
                <TabsTrigger value="url" className="flex-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                  <LinkIcon className="w-4 h-4 mr-2" />
                  URL
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
                >
                  <Upload className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">Rasmni tanlash uchun bosing</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">JPG, PNG, WEBP</p>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </TabsContent>

              <TabsContent value="url" className="mt-4 space-y-4">
                <Input
                  placeholder="https://example.com/image.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="bg-card border-border font-mono text-sm"
                />
                <Button onClick={handleUrlAnalyze} disabled={loading} className="w-full glow-cyan bg-cyan/20 text-cyan hover:bg-cyan/30 border border-cyan/30">
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                  Tahlil qilish
                </Button>
              </TabsContent>
            </Tabs>

            {previewSrc && (
              <div className="rounded-xl overflow-hidden border border-border">
                <img src={previewSrc} alt="Preview" className="w-full max-h-[400px] object-contain bg-muted" />
              </div>
            )}
          </div>

          {/* Results */}
          <div className="space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <Loader2 className="w-10 h-10 text-cyan animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground font-mono text-sm">Rasm tahlil qilinmoqda...</p>
                </div>
              </div>
            )}

            {result && (
              <>
                {result._provider && (
                  <div className="flex items-center justify-end mb-2">
                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] ${
                        result._provider === "google-ai-studio"
                          ? "border-primary/40 text-primary bg-primary/5"
                          : "border-orange-500/40 text-orange-500 bg-orange-500/5"
                      }`}
                      title={
                        result._provider === "google-ai-studio"
                          ? "Bepul Google AI Studio orqali"
                          : "Lovable AI Gateway orqali (kredit sarflandi)"
                      }
                    >
                      {result._provider === "google-ai-studio" ? "⚡ Bepul (Google)" : "💳 Kreditli (Lovable)"}
                    </Badge>
                  </div>
                )}
                {result.harmful_content?.is_harmful ? (
                  <div className="flex flex-col items-center justify-center py-16 border border-destructive/30 bg-destructive/5 rounded-xl">
                    <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
                    <h2 className="text-2xl font-bold text-destructive mb-2">🚫 Bloklangan</h2>
                    <p className="text-muted-foreground text-center max-w-md">
                      Bu kontent xavfsizlik siyosatiga mos kelmaydi va bloklandi.
                    </p>
                  </div>
                ) : (
                  <>
                    <AnalysisCard title="Tavsif" icon={<Sparkles className="w-5 h-5" />}>
                      <p className="text-foreground leading-relaxed">{result.description}</p>
                    </AnalysisCard>

                    <div className="grid grid-cols-2 gap-4">
                      <AnalysisCard title="Sahna turi" icon={<Eye className="w-5 h-5" />}>
                        <p className="text-xl font-bold text-cyan">{result.scene_type}</p>
                        <p className="text-sm text-muted-foreground mt-1">{result.mood}</p>
                      </AnalysisCard>
                      <AnalysisCard title="Sifat" icon={<Sparkles className="w-5 h-5" />}>
                        <p className="text-xl font-bold text-primary capitalize">{result.quality}</p>
                        {result.contains_people && (
                          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {result.estimated_people_count} kishi
                          </p>
                        )}
                      </AnalysisCard>
                    </div>

                    <AnalysisCard title="Ob'ektlar" icon={<Eye className="w-5 h-5" />}>
                      <div className="flex flex-wrap gap-2">
                        {result.objects.map((o) => (
                          <Badge key={o} variant="secondary" className="font-mono text-xs bg-cyan/10 text-cyan border-cyan/20">{o}</Badge>
                        ))}
                      </div>
                    </AnalysisCard>

                    <AnalysisCard title="Ranglar" icon={<Palette className="w-5 h-5" />}>
                      <div className="flex flex-wrap gap-2">
                        {result.colors.map((c) => (
                          <Badge key={c} variant="outline" className="font-mono text-xs">{c}</Badge>
                        ))}
                      </div>
                    </AnalysisCard>

                    <AnalysisCard title="Teglar" icon={<Tag className="w-5 h-5" />}>
                      <div className="flex flex-wrap gap-2">
                        {result.tags.map((t) => (
                          <Badge key={t} variant="secondary" className="font-mono text-xs bg-primary/10 text-primary border-primary/20">{t}</Badge>
                        ))}
                      </div>
                    </AnalysisCard>

                    {result.text_detected && (
                      <AnalysisCard title="Aniqlangan matn" icon={<Eye className="w-5 h-5" />}>
                        <p className="text-foreground font-mono text-sm bg-muted p-3 rounded-lg">{result.text_detected}</p>
                      </AnalysisCard>
                    )}

                    <div className="p-4 rounded-lg border bg-green-500/10 border-green-500/30">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-green-500" />
                        <span className="font-bold text-green-500">✅ Xavfsiz kontent</span>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {!loading && !result && (
              <div className="flex items-center justify-center py-20 border border-dashed border-border rounded-xl">
                <div className="text-center">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">Natijalar bu yerda ko'rsatiladi</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
