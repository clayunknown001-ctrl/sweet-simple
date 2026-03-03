import { useState, useRef } from "react";
import { Video, Upload, Loader2, Eye, Tag, Users, Sparkles, Activity, MessageSquare } from "lucide-react";
import Navbar from "@/components/Navbar";
import AnalysisCard from "@/components/AnalysisCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface VideoScene {
  timestamp: string;
  description: string;
}

interface VideoResult {
  description: string;
  scenes: VideoScene[];
  objects: string[];
  actions: string[];
  mood: string;
  category: string;
  contains_speech: boolean;
  speech_summary: string;
  contains_people: boolean;
  estimated_people_count: number;
  tags: string[];
  quality: string;
}

const languages = [
  { code: "uz", label: "O'zbek" },
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
];

const MAX_SIZE_MB = 15;

export default function VideoAnalysis() {
  const [result, setResult] = useState<VideoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState("uz");
  const [videoName, setVideoName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast({ title: "Faqat video fayllarini yuklang", variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast({ title: `Video hajmi ${MAX_SIZE_MB}MB dan oshmasligi kerak`, variant: "destructive" });
      return;
    }
    setVideoName(file.name);
    setLoading(true);
    setResult(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        const { data, error } = await supabase.functions.invoke("analyze-video", {
          body: { video_base64: base64, mime_type: file.type, language },
        });
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        setResult(data);
      } catch (err: any) {
        toast({ title: "Xatolik", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-background bg-grid">
      <Navbar />
      <div className="container mx-auto pt-24 pb-12 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            <Video className="inline w-8 h-8 text-primary mr-2" />
            Video tahlili
          </h1>
          <p className="text-muted-foreground">Videoni yuklang va AI tahlil qilsin</p>
          <div className="flex gap-2 mt-3">
            {languages.map((l) => (
              <Button
                key={l.code}
                size="sm"
                variant={language === l.code ? "default" : "outline"}
                onClick={() => setLanguage(l.code)}
                className={language === l.code ? "" : "text-muted-foreground"}
              >
                {l.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Upload */}
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <Upload className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Videoni tanlash uchun bosing</p>
              <p className="text-xs text-muted-foreground/50 mt-1">MP4, WEBM, MOV (max {MAX_SIZE_MB}MB)</p>
            </div>
            <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileUpload} className="hidden" />

            {videoName && (
              <div className="rounded-xl border border-border p-4 bg-card">
                <p className="text-sm text-muted-foreground font-mono flex items-center gap-2">
                  <Video className="w-4 h-4" /> {videoName}
                </p>
              </div>
            )}
          </div>

          {/* Results */}
          <div className="space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground font-mono text-sm">Video tahlil qilinmoqda...</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">Bu biroz vaqt olishi mumkin</p>
                </div>
              </div>
            )}

            {result && (
              <>
                <AnalysisCard title="Tavsif" icon={<Sparkles className="w-5 h-5" />}>
                  <p className="text-foreground leading-relaxed">{result.description}</p>
                </AnalysisCard>

                <div className="grid grid-cols-2 gap-4">
                  <AnalysisCard title="Kategoriya" icon={<Eye className="w-5 h-5" />}>
                    <p className="text-xl font-bold text-primary capitalize">{result.category}</p>
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

                <AnalysisCard title="Sahnalar" icon={<Activity className="w-5 h-5" />}>
                  <div className="space-y-3">
                    {result.scenes.map((s, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <Badge variant="outline" className="font-mono text-xs shrink-0 mt-0.5">{s.timestamp}</Badge>
                        <p className="text-sm text-foreground">{s.description}</p>
                      </div>
                    ))}
                  </div>
                </AnalysisCard>

                <AnalysisCard title="Harakatlar" icon={<Activity className="w-5 h-5" />}>
                  <div className="flex flex-wrap gap-2">
                    {result.actions.map((a) => (
                      <Badge key={a} variant="secondary" className="font-mono text-xs bg-primary/10 text-primary border-primary/20">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </AnalysisCard>

                <AnalysisCard title="Ob'ektlar" icon={<Eye className="w-5 h-5" />}>
                  <div className="flex flex-wrap gap-2">
                    {result.objects.map((o) => (
                      <Badge key={o} variant="secondary" className="font-mono text-xs bg-cyan/10 text-cyan border-cyan/20">
                        {o}
                      </Badge>
                    ))}
                  </div>
                </AnalysisCard>

                {result.contains_speech && result.speech_summary && (
                  <AnalysisCard title="Nutq" icon={<MessageSquare className="w-5 h-5" />}>
                    <p className="text-foreground text-sm bg-muted p-3 rounded-lg">{result.speech_summary}</p>
                  </AnalysisCard>
                )}

                <AnalysisCard title="Teglar" icon={<Tag className="w-5 h-5" />}>
                  <div className="flex flex-wrap gap-2">
                    {result.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="font-mono text-xs bg-primary/10 text-primary border-primary/20">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </AnalysisCard>
              </>
            )}

            {!loading && !result && (
              <div className="flex items-center justify-center py-20 border border-dashed border-border rounded-xl">
                <div className="text-center">
                  <Video className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
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
