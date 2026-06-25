import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, Copy, Check, Shield, KeyRound, Loader2, Trash2, LogIn,
  Zap, Crown, Infinity as InfinityIcon, AlertTriangle, CreditCard,
} from "lucide-react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BASE_URL = "https://gpfweizmjzaupfxxmqvg.supabase.co";

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group">
      <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-xs md:text-sm font-mono text-foreground border border-border">
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 border border-border"
      >
        {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

interface MyKey {
  id: string;
  key_masked: string;
  tier: string;
  environment: string;
  status: string;
  token_quota: number;
  tokens_used: number;
  payment_status: string;
  stripe_subscription_id: string | null;
  created_at: string;
}

const TIER_LABEL: Record<string, string> = {
  free_trial: "Free Trial",
  pro_monthly: "Pro Monthly",
  pay_as_you_go: "Pay-as-you-go",
};

export default function Api() {
  const { session, user } = useAuth();
  const [keys, setKeys] = useState<MyKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [billingKey, setBillingKey] = useState<MyKey | null>(null);

  const load = async () => {
    if (!session) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("api_keys")
      .select("id,key_masked,tier,environment,status,token_quota,tokens_used,payment_status,stripe_subscription_id,created_at")
      .eq("developer_id", user!.id)
      .neq("status", "deleted")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setKeys((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [session?.user?.id]);

  const generate = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("generate_my_api_key");
    if (error) toast.error(error.message);
    else {
      const token = (data as any)?.token;
      setRevealed(token);
      toast.success("API kalit yaratildi — hozir nusxa oling, qaytadan ko'rsatilmaydi.");
      await load();
    }
    setBusy(false);
  };

  const hardDelete = async (id: string) => {
    if (!confirm("Bu kalitni butunlay o'chirib tashlaysizmi?")) return;
    const { error } = await supabase.rpc("delete_my_api_key", { _key_id: id });
    if (error) toast.error(error.message);
    else {
      toast.success("Kalit o'chirildi");
      await load();
    }
  };

  const startCheckout = async (key: MyKey, tier: "pro_monthly" | "pay_as_you_go") => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-stripe-checkout", {
        body: { key_id: key.id, tier },
      });
      if (error) throw error;
      if ((data as any)?.url) {
        window.location.href = (data as any).url;
        return;
      }
      if ((data as any)?.placeholder) {
        toast.info("Stripe hali ulanmagan. To'lov tizimi sozlanguncha tier yangilanmaydi.");
        setBillingKey(null);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Checkout xato");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background bg-grid">
      <Navbar />
      <section className="container mx-auto pt-28 pb-16 px-4 max-w-5xl space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm font-mono mb-4">
            <KeyRound className="w-4 h-4" />
            AI Content Safety API
          </div>
          <h1 className="text-3xl md:text-5xl font-bold mb-3">
            <span className="text-foreground">Sizning </span>
            <span className="text-primary">API kalitingiz</span>
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Token-asosli moderatsiya API. Free Trial cheklangan, Pro yoki Pay-as-you-go bilan kengaytiring.
          </p>
        </div>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" /> API kalitingiz
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!session ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-4">
                  API kalitini yaratish uchun hisobingizga kiring.
                </p>
                <Button asChild>
                  <Link to="/auth"><LogIn className="w-4 h-4 mr-2" /> Kirish / Ro'yxatdan o'tish</Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm text-muted-foreground">
                    {keys.filter(k => k.status === "active").length} / 3 aktiv kalit · {user?.email}
                  </p>
                  <Button onClick={generate} disabled={busy || keys.filter(k=>k.status==='active').length>=3}>
                    {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                    Yangi kalit yaratish
                  </Button>
                </div>

                {revealed && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
                    <p className="text-xs font-semibold text-amber-500 mb-2">
                      ⚠️ Kalitni hozir nusxa oling — bu yagona imkoniyat!
                    </p>
                    <CodeBlock code={revealed} />
                  </div>
                )}

                {loading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : keys.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Hali kalitingiz yo'q.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {keys.map((k) => <ApiKeyRow key={k.id} k={k}
                      onDelete={() => hardDelete(k.id)}
                      onUpgrade={() => setBillingKey(k)} />)}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>


        {/* Docs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" /> API hujjatlari
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
              <p><Shield className="w-4 h-4 inline mr-1 text-primary" /> 3 ta endpoint:</p>
              <ul className="font-mono text-xs space-y-1 pl-6">
                <li><span className="text-primary">POST</span> {BASE_URL}/functions/v1/analyze-text</li>
                <li><span className="text-primary">POST</span> {BASE_URL}/functions/v1/analyze-image</li>
                <li><span className="text-primary">POST</span> {BASE_URL}/functions/v1/analyze-video</li>
              </ul>
              <p className="text-xs text-muted-foreground pt-1">
                Header: <code className="bg-muted px-1 rounded">Authorization: Bearer {`{YOUR_API_KEY}`}</code>
              </p>
            </div>

            <Tabs defaultValue="js">
              <TabsList>
                <TabsTrigger value="js">JavaScript</TabsTrigger>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="py">Python</TabsTrigger>
              </TabsList>
              <TabsContent value="js" className="mt-4">
                <CodeBlock code={`const API_KEY = "sk_test_...";

const res = await fetch("${BASE_URL}/functions/v1/analyze-text", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": \`Bearer \${API_KEY}\`,
  },
  body: JSON.stringify({ text: "salom", language: "uz" }),
});
const { should_block, reason, score, tokens_used } = await res.json();`} />
              </TabsContent>
              <TabsContent value="curl" className="mt-4">
                <CodeBlock code={`curl -X POST "${BASE_URL}/functions/v1/analyze-image" \\
  -H "Authorization: Bearer sk_test_..." \\
  -H "Content-Type: application/json" \\
  -d '{"image_url":"https://example.com/img.jpg","language":"uz"}'`} />
              </TabsContent>
              <TabsContent value="py" className="mt-4">
                <CodeBlock code={`import requests
r = requests.post(
    "${BASE_URL}/functions/v1/analyze-video",
    headers={"Authorization": "Bearer sk_test_..."},
    json={"video_url": "https://...", "language": "uz"},
)
print(r.json())`} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>

      {/* Billing modal */}
      <Dialog open={!!billingKey} onOpenChange={(o) => !o && setBillingKey(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" /> Tarifni yangilang
            </DialogTitle>
            <DialogDescription>
              Karta orqali xavfsiz to'lov. Istalgan vaqtda bekor qilishingiz mumkin.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <button
              disabled={busy}
              onClick={() => billingKey && startCheckout(billingKey, "pro_monthly")}
              className="w-full rounded-lg border border-primary/40 bg-primary/5 hover:bg-primary/10 p-4 text-left transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold flex items-center gap-2"><Crown className="w-4 h-4 text-amber-400"/> Pro Monthly</span>
                <span className="text-primary font-bold">$20<span className="text-xs text-muted-foreground">/oy</span></span>
              </div>
              <p className="text-xs text-muted-foreground">2,000,000 premium token. Oylik avtomatik yangilanish.</p>
            </button>
            <button
              disabled={busy}
              onClick={() => billingKey && startCheckout(billingKey, "pay_as_you_go")}
              className="w-full rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 p-4 text-left transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold flex items-center gap-2"><InfinityIcon className="w-4 h-4 text-primary"/> Pay-as-you-go</span>
                <span className="font-bold">Metered</span>
              </div>
              <p className="text-xs text-muted-foreground">Limitsiz. Iste'mol hisoblanib, oy oxirida hisob-kitob qilinadi.</p>
            </button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBillingKey(null)}>Bekor qilish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApiKeyRow({
  k, onDelete, onUpgrade,
}: { k: MyKey; onDelete: () => void; onUpgrade: () => void }) {
  const unlimited = k.tier === "pay_as_you_go";
  const pct = useMemo(
    () => unlimited ? 0 : Math.min(100, (k.tokens_used / Math.max(1, k.token_quota)) * 100),
    [k, unlimited],
  );
  const remaining = unlimited ? Infinity : Math.max(0, k.token_quota - k.tokens_used);
  const lowWarn = !unlimited && pct >= 85;

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 font-mono text-sm flex-wrap">
          {k.key_masked}
          <Badge variant={k.status === "active" ? "default" : "secondary"}>{k.status}</Badge>
          <Badge variant="outline">{TIER_LABEL[k.tier] ?? k.tier}</Badge>
          {k.payment_status !== "none" && (
            <Badge variant="outline" className="border-primary/40 text-primary">
              {k.payment_status}
            </Badge>
          )}
          <Badge variant="outline">{k.environment}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {k.tier === "free_trial" && (
            <Button size="sm" onClick={onUpgrade}>
              <Crown className="w-4 h-4 mr-1" /> Upgrade
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {unlimited ? (
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-primary">
            <InfinityIcon className="w-3 h-3" /> Limitsiz · {k.tokens_used.toLocaleString()} token ishlatildi
          </span>
          <span className="text-muted-foreground">Pay-as-you-go faol</span>
        </div>
      ) : (
        <>
          <div className="flex justify-between text-xs">
            <span className={lowWarn ? "text-amber-500 font-semibold flex items-center gap-1" : "text-muted-foreground"}>
              {lowWarn && <AlertTriangle className="w-3 h-3" />}
              {k.tokens_used.toLocaleString()} / {k.token_quota.toLocaleString()} tokens consumed
            </span>
            <span className="text-muted-foreground">{remaining.toLocaleString()} qoldi</span>
          </div>
          <Progress value={pct} className={lowWarn ? "[&>div]:bg-amber-500" : ""} />
          {lowWarn && (
            <p className="text-xs text-amber-500">
              ⚠️ Tokenlar tugab bormoqda. Pro yoki Pay-as-you-go ga o'tib limitsiz ishlang.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function PlanCard({
  icon, name, price, tokens, tagline, highlight,
}: {
  icon: React.ReactNode; name: string; price: string;
  tokens: string; tagline: string; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/50 bg-primary/5" : ""}>
      <CardContent className="pt-5 space-y-2">
        <div className="flex items-center gap-2 font-semibold">{icon} {name}</div>
        <p className="text-2xl font-bold">{price}</p>
        <p className="text-sm text-primary font-mono">{tokens}</p>
        <p className="text-xs text-muted-foreground">{tagline}</p>
      </CardContent>
    </Card>
  );
}
