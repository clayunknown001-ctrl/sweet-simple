import { useEffect, useMemo, useState } from "react";
import { supabase as _sb } from "@/integrations/supabase/client";
const supabase: any = _sb;
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, KeyRound, Copy, Pause, Play, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

interface ApiKey {
  id: string;
  developer_email: string;
  key_masked: string;
  status: "active" | "suspended";
  monthly_quota: number;
  requests_used: number;
  tier: "free_trial" | "developer_pro" | "enterprise";
  environment: "staging" | "production";
  created_at: string;
}

const TIERS = ["free_trial", "developer_pro", "enterprise"] as const;

export default function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [series, setSeries] = useState<{ day: string; requests: number }[]>([]);

  // New key form
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<(typeof TIERS)[number]>("free_trial");
  const [environment, setEnvironment] = useState<"staging" | "production">("staging");

  const load = async () => {
    setLoading(true);
    const [{ data: kData, error: kErr }, { data: aData }] = await Promise.all([
      supabase.from("api_keys").select("*").order("created_at", { ascending: false }),
      supabase.rpc("get_api_usage_analytics"),
    ]);
    if (kErr) toast.error(kErr.message);
    else setKeys((kData as any) ?? []);
    if (aData) setSeries(((aData as any).series ?? []) as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const generate = async () => {
    if (!email.trim()) return toast.error("Enter developer email");
    setBusy("generate");
    const { data, error } = await supabase.rpc("generate_api_key", {
      _developer_email: email.trim(),
      _tier: tier,
      _environment: environment,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    const token = (data as any)?.token as string;
    if (token) {
      await navigator.clipboard.writeText(token).catch(() => {});
      toast.success("API key generated and copied to clipboard");
    }
    setEmail("");
    load();
  };

  const toggleSuspend = async (k: ApiKey) => {
    setBusy(k.id);
    const next = k.status === "active" ? "suspended" : "active";
    const { error } = await supabase
      .from("api_keys")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", k.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Key ${next}`);
    load();
  };

  const upgradeTier = async (k: ApiKey, newTier: ApiKey["tier"]) => {
    const quota =
      newTier === "enterprise" ? 1000000 : newTier === "developer_pro" ? 250000 : 50000;
    setBusy(k.id);
    const { error } = await supabase
      .from("api_keys")
      .update({ tier: newTier, monthly_quota: quota, updated_at: new Date().toISOString() })
      .eq("id", k.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Tier updated to ${newTier}`);
    load();
  };

  const totals = useMemo(
    () => ({
      total: keys.length,
      active: keys.filter((k) => k.status === "active").length,
      requests: keys.reduce((s, k) => s + k.requests_used, 0),
    }),
    [keys]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Total Keys" value={totals.total.toString()} />
        <StatCard label="Active" value={totals.active.toString()} />
        <StatCard label="Requests (all-time)" value={totals.requests.toLocaleString()} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4" /> API Requests — Last 30 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="reqFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="requests"
                  stroke="hsl(var(--primary))"
                  fill="url(#reqFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="w-4 h-4" /> Generate New Production API Key
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input
            placeholder="developer@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="md:col-span-2"
          />
          <Select value={tier} onValueChange={(v) => setTier(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIERS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={environment} onValueChange={(v) => setEnvironment(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="staging">staging</SelectItem>
              <SelectItem value="production">production</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={generate} disabled={busy === "generate"} className="md:col-span-4">
            {busy === "generate" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Generate Key
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">B2B Developers</CardTitle></CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No API keys yet. Generate one above.
            </p>
          ) : (
            <div className="space-y-3">
              {keys.map((k) => {
                const pct = Math.min(100, (k.requests_used / k.monthly_quota) * 100);
                return (
                  <div key={k.id} className="border border-border rounded-lg p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-semibold">{k.developer_email}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <code className="text-xs bg-muted px-2 py-0.5 rounded">{k.key_masked}</code>
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(k.key_masked);
                              toast.success("Masked token copied");
                            }}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Badge variant={k.status === "active" ? "default" : "destructive"}>
                            {k.status}
                          </Badge>
                          <Badge variant="outline">{k.environment}</Badge>
                          <Badge variant="secondary">{k.tier}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Select
                          value={k.tier}
                          onValueChange={(v) => upgradeTier(k, v as any)}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIERS.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant={k.status === "active" ? "destructive" : "default"}
                          size="sm"
                          onClick={() => toggleSuspend(k)}
                          disabled={busy === k.id}
                        >
                          {k.status === "active" ? (
                            <><Pause className="w-3 h-3 mr-1" /> Suspend</>
                          ) : (
                            <><Play className="w-3 h-3 mr-1" /> Reactivate</>
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mb-1.5">
                      {k.requests_used.toLocaleString()} / {k.monthly_quota.toLocaleString()} API calls this month
                    </div>
                    <Progress value={pct} />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
