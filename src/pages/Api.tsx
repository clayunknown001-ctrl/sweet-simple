import { useEffect, useState } from "react";
import { BookOpen, Copy, Check, Shield, KeyRound, Loader2, Trash2, LogIn } from "lucide-react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  monthly_quota: number;
  requests_used: number;
  created_at: string;
}

export default function Api() {
  const { session, user } = useAuth();
  const [keys, setKeys] = useState<MyKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const load = async () => {
    if (!session) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("api_keys")
      .select("id,key_masked,tier,environment,status,monthly_quota,requests_used,created_at")
      .eq("developer_id", user!.id)
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
      toast.success("API key yaratildi — uni hozir saqlab oling, qaytadan ko'rsatilmaydi.");
      await load();
    }
    setBusy(false);
  };

  const revoke = async (id: string) => {
    if (!confirm("Bu kalitni bekor qilishni xohlaysizmi?")) return;
    const { error } = await supabase.rpc("revoke_my_api_key", { _key_id: id });
    if (error) toast.error(error.message);
    else {
      toast.success("Kalit bekor qilindi");
      await load();
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
            Bir martalik kalit yarating va matn / rasm / video moderatsiyasini o'z ilovangizga ulang.
          </p>
        </div>

        {/* Personal key panel */}
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
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {keys.length} / 3 aktiv kalit · {user?.email}
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
                    {keys.map((k) => {
                      const pct = Math.min(100, (k.requests_used / k.monthly_quota) * 100);
                      return (
                        <div key={k.id} className="border border-border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 font-mono text-sm">
                              {k.key_masked}
                              <Badge variant={k.status === "active" ? "default" : "secondary"}>
                                {k.status}
                              </Badge>
                              <Badge variant="outline">{k.tier}</Badge>
                              <Badge variant="outline">{k.environment}</Badge>
                            </div>
                            {k.status === "active" && (
                              <Button size="sm" variant="ghost" onClick={() => revoke(k.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>{k.requests_used.toLocaleString()} so'rov</span>
                            <span>{k.monthly_quota.toLocaleString()} oylik kvota</span>
                          </div>
                          <Progress value={pct} />
                        </div>
                      );
                    })}
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
              <BookOpen className="w-5 h-5" /> API hujjatlari — Brauzer integratsiyasi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
              <p><Shield className="w-4 h-4 inline mr-1 text-primary" /> 3 ta endpoint <code className="px-1.5 py-0.5 rounded bg-muted text-primary">should_block</code> maydonini qaytaradi:</p>
              <ul className="font-mono text-xs space-y-1 pl-6">
                <li><span className="text-primary">POST</span> {BASE_URL}/functions/v1/analyze-text</li>
                <li><span className="text-primary">POST</span> {BASE_URL}/functions/v1/analyze-image</li>
                <li><span className="text-primary">POST</span> {BASE_URL}/functions/v1/analyze-video</li>
              </ul>
              <p className="text-xs text-muted-foreground pt-1">
                Header: <code className="bg-muted px-1 rounded">Authorization: Bearer {`{YOUR_API_KEY}`}</code> · Til: <code className="bg-muted px-1 rounded">language: "uz" | "en" | "ru"</code>
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

async function analyzeText(text) {
  const res = await fetch("${BASE_URL}/functions/v1/analyze-text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer \${API_KEY}\`,
    },
    body: JSON.stringify({ text, language: "uz" }),
  });
  const { should_block, reason, score } = await res.json();
  if (should_block) console.warn("Blocked:", reason);
  return { should_block, score };
}`} />
              </TabsContent>
              <TabsContent value="curl" className="mt-4">
                <CodeBlock code={`curl -X POST "${BASE_URL}/functions/v1/analyze-image" \\
  -H "Authorization: Bearer sk_test_..." \\
  -H "Content-Type: application/json" \\
  -d '{"image_url":"https://example.com/img.jpg","language":"uz"}'`} />
              </TabsContent>
              <TabsContent value="py" className="mt-4">
                <CodeBlock code={`import requests

API_KEY = "sk_test_..."
r = requests.post(
    "${BASE_URL}/functions/v1/analyze-video",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={"video_url": "https://...", "language": "uz"},
)
print(r.json())  # { should_block, reason, score }`} />
              </TabsContent>
            </Tabs>

            <div className="rounded-lg border border-border bg-card p-4 text-sm">
              <p className="font-semibold mb-2">Javob formati</p>
              <CodeBlock code={`{
  "should_block": true,
  "reason": "nsfw_detected",
  "score": 0.94,
  "categories": ["nsfw", "violence"],
  "language": "uz"
}`} />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
