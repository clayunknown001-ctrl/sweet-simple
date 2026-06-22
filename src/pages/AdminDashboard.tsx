import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Loader2, Users, DollarSign, TrendingUp, HardDrive, Lock, LogOut, KeyRound, Cpu,
  CalendarDays, CalendarRange, Wallet, ArrowUpRight, ShoppingBag, ChevronRight, Crown, UserPlus, List,
} from "lucide-react";
import CoreScriptConfig from "@/components/admin/CoreScriptConfig";
import ApiKeysPanel from "@/components/admin/ApiKeysPanel";

interface Analytics {
  total_users_count: number;
  monthly_revenue: number;
  all_time_profit: number;
  db_storage_used_bytes: number;
  db_storage_limit_bytes: number;
}

interface Feedback {
  id: string;
  user_email: string;
  message: string;
  created_at: string;
}

interface Purchase {
  id: string;
  name: string;
  email: string;
  plan: string;
  amount: number;
  at: string;
}

interface Subscriber {
  id: string;
  name: string;
  email: string;
  joined: string;
  pro?: boolean;
  renewals?: number;
  activeUntil?: string;
}

const fmt = (n: number) => new Intl.NumberFormat().format(n);
const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const mb = (b: number) => (b / 1024 / 1024).toFixed(1) + " MB";
const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// --- Mock data (wired dynamically; replace with backend later) ---
const MOCK_PURCHASES: Purchase[] = [
  { id: "p1", name: "Akmal Karimov", email: "akmal@example.com", plan: "Pro Plan", amount: 29, at: new Date(Date.now() - 1000 * 60 * 12).toISOString() },
  { id: "p2", name: "Dilnoza Rashidova", email: "dilnoza@example.com", plan: "Pro Plan", amount: 29, at: new Date(Date.now() - 1000 * 60 * 95).toISOString() },
  { id: "p3", name: "Bekzod Tursunov", email: "bekzod@example.com", plan: "Starter", amount: 9, at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString() },
  { id: "p4", name: "Madina Yusupova", email: "madina@example.com", plan: "Pro Plan", amount: 29, at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString() },
  { id: "p5", name: "Sardor Aliev", email: "sardor@example.com", plan: "Pro Plan", amount: 29, at: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString() },
];

const MOCK_SUBSCRIBERS: Subscriber[] = [
  { id: "s1", name: "Akmal Karimov", email: "akmal@example.com", joined: "2026-05-10", pro: true, renewals: 4, activeUntil: "2026-07-10" },
  { id: "s2", name: "Dilnoza Rashidova", email: "dilnoza@example.com", joined: "2026-06-02", pro: true, renewals: 1, activeUntil: "2026-07-02" },
  { id: "s3", name: "Bekzod Tursunov", email: "bekzod@example.com", joined: "2026-06-15" },
  { id: "s4", name: "Madina Yusupova", email: "madina@example.com", joined: "2026-04-21", pro: true, renewals: 3, activeUntil: "2026-05-21" },
  { id: "s5", name: "Sardor Aliev", email: "sardor@example.com", joined: "2026-06-18", pro: true, renewals: 1, activeUntil: "2026-07-18" },
  { id: "s6", name: "Nigora Saidova", email: "nigora@example.com", joined: "2026-03-30" },
  { id: "s7", name: "Jasur Komilov", email: "jasur@example.com", joined: "2026-06-20" },
];

export default function AdminDashboard() {
  const { role, signOut, user } = useAuth();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetEmail, setTargetEmail] = useState("");
  const [acting, setActing] = useState(false);
  const [listOpen, setListOpen] = useState<null | "all" | "pro">(null);

  const monthly = analytics?.monthly_revenue ?? 0;
  const dailyProfit = +(monthly / 30).toFixed(2);
  const yearlyProfit = +(monthly * 12).toFixed(2);
  const proSubs = useMemo(() => MOCK_SUBSCRIBERS.filter((s) => s.pro), []);
  const newThisMonth = useMemo(() => {
    const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 30;
    return MOCK_SUBSCRIBERS.filter((s) => new Date(s.joined).getTime() >= cutoff).length;
  }, []);
  const isActive = (s: Subscriber) => !!s.activeUntil && new Date(s.activeUntil).getTime() >= Date.now();

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: aData, error: aErr }, { data: fData, error: fErr }] = await Promise.all([
        supabase.rpc("get_system_analytics"),
        supabase.from("feedback").select("*").order("created_at", { ascending: false }).limit(100),
      ]);
      if (aErr) toast.error(aErr.message);
      else setAnalytics(aData as any);
      if (fErr) toast.error(fErr.message);
      else setFeedback((fData as any) || []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateRole = async (newRole: "admin" | "user") => {
    if (!targetEmail.trim()) return toast.error("Enter an email");
    setActing(true);
    try {
      const { data, error } = await supabase.rpc("set_user_role_by_email", {
        _email: targetEmail.trim(),
        _role: newRole,
      });
      if (error) toast.error(error.message);
      else {
        toast.success(`Role updated to ${newRole}`);
        setTargetEmail("");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const storagePct = analytics
    ? Math.min(100, (analytics.db_storage_used_bytes / analytics.db_storage_limit_bytes) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Signed in as {user?.email} · Role: <span className="font-semibold text-primary">{role}</span>
            </p>
          </div>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
            <TabsTrigger value="api-keys"><KeyRound className="w-3 h-3 mr-1" /> B2B API Keys</TabsTrigger>
            <TabsTrigger value="core-script"><Cpu className="w-3 h-3 mr-1" /> Core Script</TabsTrigger>
            <TabsTrigger value="admins">
              Admin Management {role !== "owner" && <Lock className="w-3 h-3 ml-1" />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys" className="mt-6"><ApiKeysPanel /></TabsContent>
          <TabsContent value="core-script" className="mt-6"><CoreScriptConfig /></TabsContent>

          <TabsContent value="overview" className="space-y-8 mt-6">
            {/* Financial KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <Kpi icon={<CalendarDays className="w-5 h-5" />} label="Daily Profit" value={usd(dailyProfit)} trend="+4.2%" />
              <Kpi icon={<DollarSign className="w-5 h-5" />} label="Monthly Revenue" value={usd(monthly)} trend="+12.8%" />
              <Kpi icon={<CalendarRange className="w-5 h-5" />} label="Yearly Profit" value={usd(yearlyProfit)} trend="+38.5%" />
              <Kpi icon={<Wallet className="w-5 h-5" />} label="All-Time Profit" value={usd(analytics?.all_time_profit ?? 0)} trend="+100%" />
            </div>

            {/* Recent Purchases */}
            <Card className="border-border/60 bg-card/60 backdrop-blur">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingBag className="w-4 h-4 text-primary" /> Recent Purchases
                </CardTitle>
                <span className="text-xs text-muted-foreground">{MOCK_PURCHASES.length} latest</span>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-y border-border/60">
                      <tr>
                        <th className="py-2.5 px-6">Customer</th>
                        <th className="py-2.5 px-6">Source</th>
                        <th className="py-2.5 px-6">Amount</th>
                        <th className="py-2.5 px-6">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MOCK_PURCHASES.map((p) => (
                        <tr key={p.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-6">
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{p.email}</div>
                          </td>
                          <td className="py-3 px-6">
                            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10">
                              Purchased: {p.plan}
                            </Badge>
                          </td>
                          <td className="py-3 px-6 font-mono">{usd(p.amount)}</td>
                          <td className="py-3 px-6 text-muted-foreground whitespace-nowrap">{timeAgo(p.at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Subscribers */}
            <section className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Subscribers</h2>
                  <p className="text-xs text-muted-foreground">Aggregated subscriber metrics &amp; lists</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                  icon={<Users className="w-5 h-5" />}
                  label="Total Subscribers"
                  value={fmt(analytics?.total_users_count ?? MOCK_SUBSCRIBERS.length)}
                  hint="All registered users"
                />
                <StatCard
                  icon={<UserPlus className="w-5 h-5" />}
                  label="New This Month"
                  value={fmt(newThisMonth)}
                  hint="Joined in last 30 days"
                />
                <InteractiveCard
                  icon={<List className="w-5 h-5" />}
                  label="Subscribers List"
                  meta={`${MOCK_SUBSCRIBERS.length} users`}
                  onClick={() => setListOpen("all")}
                />
                <InteractiveCard
                  icon={<Crown className="w-5 h-5" />}
                  label="Pro Subscribers List"
                  meta={`${proSubs.length} pro users`}
                  onClick={() => setListOpen("pro")}
                  accent
                />
              </div>
            </section>

            {/* Spacer + Database Storage */}
            <div className="pt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><HardDrive className="w-5 h-5" /> Database Storage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between text-sm mb-2">
                    <span>{mb(analytics?.db_storage_used_bytes ?? 0)} used</span>
                    <span className="text-muted-foreground">/ {mb(analytics?.db_storage_limit_bytes ?? 0)}</span>
                  </div>
                  <Progress value={storagePct} />
                  <p className="text-xs text-muted-foreground mt-2">{storagePct.toFixed(2)}% of quota</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>


          <TabsContent value="feedback" className="mt-6">
            <Card>
              <CardHeader><CardTitle>User Feedback ({feedback.length})</CardTitle></CardHeader>
              <CardContent>
                {feedback.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No feedback yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-muted-foreground border-b border-border">
                        <tr>
                          <th className="py-2 pr-4">Email</th>
                          <th className="py-2 pr-4">Message</th>
                          <th className="py-2">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {feedback.map((f) => (
                          <tr key={f.id} className="border-b border-border/50">
                            <td className="py-3 pr-4 font-medium">{f.user_email}</td>
                            <td className="py-3 pr-4">{f.message}</td>
                            <td className="py-3 text-muted-foreground whitespace-nowrap">
                              {new Date(f.created_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="admins" className="mt-6">
            {role !== "owner" ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="text-lg font-semibold">Owner Only</h3>
                  <p className="text-sm text-muted-foreground">Only the owner can manage administrator access.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader><CardTitle>Manage Administrators</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">User email</label>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={targetEmail}
                      onChange={(e) => setTargetEmail(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => updateRole("admin")} disabled={acting}>
                      {acting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Promote to Admin
                    </Button>
                    <Button variant="destructive" onClick={() => updateRole("user")} disabled={acting}>
                      Revoke Admin
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Owner accounts cannot be modified through this panel.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className="text-primary opacity-70">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
