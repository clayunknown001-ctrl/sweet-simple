import { useState } from "react";
import { FileText, Send, Loader2, Globe, Heart, Tag, Clock, BookOpen, Users, Sparkles, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import Navbar from "@/components/Navbar";
import AnalysisCard from "@/components/AnalysisCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface HarmfulContent {
  is_harmful: boolean;
  severity: string;
  categories: string[];
  details: string;
  flagged_phrases: string[];
}

interface TextResult {
  summary: string;
  language: string;
  sentiment: string;
  sentiment_score: number;
  topics: string[];
  word_count: number;
  reading_time_minutes: number;
  content_type: string;
  tone: string;
  key_entities: string[];
  harmful_content: HarmfulContent;
  should_block: boolean;
  block_reason: string;
  _provider?: string;
}

const langs = [
  { code: "uz", label: "UZ" },
  { code: "en", label: "EN" },
  { code: "ru", label: "RU" },
];

export default function TextAnalysis() {
  const [text, setText] = useState("");
  const [lang, setLang] = useState("uz");
  const [result, setResult] = useState<TextResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastText, setLastText] = useState("");
  const { toast } = useToast();

  const analyze = async (overrideLang?: string) => {
    const t = overrideLang ? lastText : text;
    if (!t.trim()) {
      toast({ title: "Matn kiriting", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-text", {
        body: { text: t, language: overrideLang || lang },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setResult(data);
      if (!overrideLang) setLastText(t);
    } catch (e: any) {
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLangChange = (code: string) => {
    setLang(code);
    if (lastText) analyze(code);
  };

  const sentimentColor = (s: string) => {
    if (s === "positive") return "text-primary";
    if (s === "negative") return "text-destructive";
    if (s === "mixed") return "text-purple";
    return "text-muted-foreground";
  };

  const sentimentEmoji = (s: string) => {
    if (s === "positive") return "😊";
    if (s === "negative") return "😞";
    if (s === "mixed") return "🤔";
    return "😐";
  };

  const severityColor = (s: string) => {
    if (s === "critical") return "bg-destructive text-destructive-foreground";
    if (s === "high") return "bg-destructive/80 text-destructive-foreground";
    if (s === "medium") return "bg-orange-500 text-white";
    if (s === "low") return "bg-yellow-500 text-black";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="min-h-screen bg-background bg-grid">
      <Navbar />
      <div className="container mx-auto pt-24 pb-12 px-4">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              <FileText className="inline w-8 h-8 text-primary mr-2" />
              Matn tahlili
            </h1>
            <p className="text-muted-foreground">Matnni kiriting va AI uni tahlil qiladi</p>
          </div>
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {langs.map((l) => (
              <button
                key={l.code}
                onClick={() => handleLangChange(l.code)}
                className={`px-3 py-1.5 rounded-md text-sm font-mono font-bold transition-all ${
                  lang === l.code
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <Textarea
              placeholder="Bu yerga matn yozing yoki joylashtiring..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[300px] bg-card border-border font-mono text-sm resize-none focus:border-primary/50 focus:ring-primary/20"
            />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground font-mono">
                {text.split(/\s+/).filter(Boolean).length} so'z
              </span>
              <Button onClick={() => analyze()} disabled={loading} className="glow-green">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Tahlil qilish
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground font-mono text-sm">AI tahlil qilmoqda...</p>
                </div>
              </div>
            )}

            {result && (
              <>
                {result.should_block || result.harmful_content?.is_harmful ? (
                  <div className="flex flex-col items-center justify-center py-16 border border-destructive/30 bg-destructive/5 rounded-xl">
                    <ShieldAlert className="w-16 h-16 text-destructive mb-4" />
                    <h2 className="text-2xl font-bold text-destructive mb-2">🚫 Bloklangan</h2>
                    <p className="text-muted-foreground text-center max-w-md">
                      Bu kontent xavfsizlik siyosatiga mos kelmaydi va bloklandi.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/30">
                      <ShieldCheck className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <p className="font-bold text-primary">✅ XAVFSIZ</p>
                        <p className="text-sm text-muted-foreground">Zararli kontent topilmadi</p>
                      </div>
                    </div>

                    <AnalysisCard title="Xulosa" icon={<Sparkles className="w-5 h-5" />}>
                      <p className="text-foreground leading-relaxed">{result.summary}</p>
                    </AnalysisCard>

                    <div className="grid grid-cols-2 gap-4">
                      <AnalysisCard title="Til" icon={<Globe className="w-5 h-5" />}>
                        <p className="text-2xl font-bold text-primary font-mono">{result.language}</p>
                      </AnalysisCard>
                      <AnalysisCard title="Kayfiyat" icon={<Heart className="w-5 h-5" />}>
                        <p className={`text-2xl font-bold font-mono ${sentimentColor(result.sentiment)}`}>
                          {sentimentEmoji(result.sentiment)} {result.sentiment}
                        </p>
                        <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${((result.sentiment_score + 1) / 2) * 100}%` }} />
                        </div>
                      </AnalysisCard>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <AnalysisCard title="O'qish vaqti" icon={<Clock className="w-5 h-5" />}>
                        <p className="text-2xl font-bold text-primary font-mono">{result.reading_time_minutes} min</p>
                        <p className="text-sm text-muted-foreground">{result.word_count} so'z</p>
                      </AnalysisCard>
                      <AnalysisCard title="Turi" icon={<BookOpen className="w-5 h-5" />}>
                        <p className="text-lg font-bold text-foreground">{result.content_type}</p>
                        <p className="text-sm text-muted-foreground">{result.tone}</p>
                      </AnalysisCard>
                    </div>

                    <AnalysisCard title="Mavzular" icon={<Tag className="w-5 h-5" />}>
                      <div className="flex flex-wrap gap-2">
                        {result.topics.map((t) => (
                          <Badge key={t} variant="secondary" className="font-mono text-xs bg-primary/10 text-primary border-primary/20">{t}</Badge>
                        ))}
                      </div>
                    </AnalysisCard>

                    {result.key_entities.length > 0 && (
                      <AnalysisCard title="Asosiy ob'ektlar" icon={<Users className="w-5 h-5" />}>
                        <div className="flex flex-wrap gap-2">
                          {result.key_entities.map((e) => (
                            <Badge key={e} variant="outline" className="font-mono text-xs">{e}</Badge>
                          ))}
                        </div>
                      </AnalysisCard>
                    )}
                  </>
                )}
              </>
            )}

            {!loading && !result && (
              <div className="flex items-center justify-center py-20 border border-dashed border-border rounded-xl">
                <div className="text-center">
                  <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
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
