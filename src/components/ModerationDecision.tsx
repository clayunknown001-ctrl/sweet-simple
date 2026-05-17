import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThumbsDown, ThumbsUp, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export interface Decision {
  id: string;
  verdict: "allow" | "warn" | "block";
  category: string;
  confidence: number;
  threshold: number;
  reasoning: string;
}

export default function ModerationDecision({ decision, blocked }: { decision?: Decision; blocked: boolean }) {
  const [sent, setSent] = useState<null | "wrong_block" | "missed_harm">(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  if (!decision) return null;

  const send = async (kind: "wrong_block" | "missed_harm") => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("moderation-feedback", {
        body: { kind, category: decision.category, content_hash: decision.id },
      });
      if (error) throw error;
      setSent(kind);
      toast({ title: "Rahmat — fikr qabul qilindi", description: "Tizim bu turdagi kontent uchun chegarani moslashtirdi." });
    } catch (e: any) {
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const color =
    decision.verdict === "block" ? "border-destructive/40 text-destructive bg-destructive/5" :
    decision.verdict === "warn" ? "border-yellow-500/40 text-yellow-500 bg-yellow-500/5" :
    "border-primary/40 text-primary bg-primary/5";

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card/60">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={`font-mono text-[10px] ${color}`}>
          <ShieldCheck className="w-3 h-3 mr-1" />
          {decision.verdict.toUpperCase()}
        </Badge>
        <Badge variant="outline" className="font-mono text-[10px]">{decision.category}</Badge>
        <span className="text-[10px] text-muted-foreground font-mono">
          conf {(decision.confidence * 100).toFixed(0)}% / thr {(decision.threshold * 100).toFixed(0)}%
        </span>
      </div>
      <div className="flex gap-1">
        {blocked ? (
          <Button
            size="sm" variant="ghost"
            disabled={loading || sent !== null}
            onClick={() => send("wrong_block")}
            className="h-7 text-[11px]"
            title="Bu kontent noto'g'ri bloklandi"
          >
            <ThumbsDown className="w-3 h-3 mr-1" />
            {sent === "wrong_block" ? "Yuborildi" : "Noto'g'ri bloklandi"}
          </Button>
        ) : (
          <Button
            size="sm" variant="ghost"
            disabled={loading || sent !== null}
            onClick={() => send("missed_harm")}
            className="h-7 text-[11px]"
            title="Zararli kontent o'tib ketdi"
          >
            <ThumbsUp className="w-3 h-3 mr-1 rotate-180" />
            {sent === "missed_harm" ? "Yuborildi" : "Zararli o'tib ketdi"}
          </Button>
        )}
      </div>
    </div>
  );
}
