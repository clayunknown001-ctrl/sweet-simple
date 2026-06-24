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
  Send, Mail, Clock, MessageSquare, Inbox, CheckCircle2, CircleDashed, CircleAlert,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MoreHorizontal, Shield, ShieldCheck, Code2, Database, Ticket, Search, Plus, Activity, Trash2, MessageCircle, Phone, MapPin } from "lucide-react";
import CoreScriptConfig from "@/components/admin/CoreScriptConfig";
import ApiKeysPanel from "@/components/admin/ApiKeysPanel";
import { ProUpgradeProvider, ProUpgradeButton, useUpgradeModal } from "@/components/admin/ProUpgradeModal";
import { Sparkles, X } from "lucide-react";

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
  status?: string | null;
  source?: string | null;
  admin_reply?: string | null;
  admin_responder_email?: string | null;
  admin_responded_at?: string | null;
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

function AdminDashboardInner() {
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

  const updateRole = async (newRole: "admin" | "user"): Promise<void> => {
    if (!targetEmail.trim()) { toast.error("Enter an email"); return; }
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
          <div className="flex items-center gap-3">
            <ProUpgradeButton />
            <Button variant="outline" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>

        <RecommendationCard />


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

            {/* Spacer + Database Storage Breakdown */}
            <div className="pt-6">
              <StorageBreakdown
                usedBytes={analytics?.db_storage_used_bytes ?? 0}
                limitBytes={analytics?.db_storage_limit_bytes ?? 0}
              />
            </div>
          </TabsContent>



          <TabsContent value="feedback" className="mt-6">
            <FeedbackPanel
              tickets={feedback}
              onChanged={load}
            />
          </TabsContent>

          <TabsContent value="admins" className="mt-6">
            <AdminManagement
              role={role}
              currentUserId={user?.id ?? null}
              targetEmail={targetEmail}
              setTargetEmail={setTargetEmail}
              acting={acting}
              updateRole={updateRole}
            />
          </TabsContent>
        </Tabs>

        <SubscriberListDialog
          open={listOpen !== null}
          onOpenChange={(o) => !o && setListOpen(null)}
          mode={listOpen ?? "all"}
          subscribers={listOpen === "pro" ? proSubs : MOCK_SUBSCRIBERS}
          isActive={isActive}
        />
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, trend }: { icon: React.ReactNode; label: string; value: string; trend?: string }) {
  return (
    <Card className="relative overflow-hidden border-border/60 bg-card/60 backdrop-blur transition-all hover:border-primary/50 hover:shadow-[0_0_24px_-12px_hsl(var(--primary))]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {trend && (
              <div className="flex items-center gap-1 text-xs text-primary">
                <ArrowUpRight className="w-3 h-3" />
                <span>{trend}</span>
                <span className="text-muted-foreground">vs last period</span>
              </div>
            )}
          </div>
          <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function InteractiveCard({
  icon, label, meta, onClick, accent,
}: { icon: React.ReactNode; label: string; meta: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`group text-left rounded-lg border bg-card/60 backdrop-blur p-5 transition-all hover:border-primary/60 hover:bg-card hover:shadow-[0_0_24px_-12px_hsl(var(--primary))] ${
        accent ? "border-primary/40" : "border-border/60"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${accent ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"}`}>{icon}</div>
          <div>
            <p className="text-sm font-semibold">{label}</p>
            <p className="text-xs text-muted-foreground">{meta}</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
      </div>
    </button>
  );
}

function SubscriberListDialog({
  open, onOpenChange, mode, subscribers, isActive,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "all" | "pro";
  subscribers: Subscriber[];
  isActive: (s: Subscriber) => boolean;
}) {
  const pro = mode === "pro";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {pro ? <Crown className="w-4 h-4 text-primary" /> : <Users className="w-4 h-4 text-primary" />}
            {pro ? "Pro Subscribers" : "All Subscribers"}
            <Badge variant="outline" className="ml-2 border-primary/40 text-primary bg-primary/10">
              {subscribers.length}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="py-2.5 pr-4">Full Name</th>
                  <th className="py-2.5 pr-4">Email</th>
                  <th className="py-2.5 pr-4">Joined</th>
                  {pro && <th className="py-2.5 pr-4">Renewals</th>}
                  {pro && <th className="py-2.5 pr-4">Status</th>}
                </tr>
              </thead>
              <tbody>
                {subscribers.map((s) => {
                  const active = isActive(s);
                  return (
                    <tr key={s.id} className="border-b border-border/40">
                      <td className="py-3 pr-4 font-medium">{s.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{s.email}</td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                        {new Date(s.joined).toLocaleDateString()}
                      </td>
                      {pro && <td className="py-3 pr-4 font-mono">{s.renewals ?? 0}</td>}
                      {pro && (
                        <td className="py-3 pr-4">
                          {active ? (
                            <Badge className="bg-primary/15 text-primary border border-primary/40 shadow-[0_0_12px_hsl(var(--primary)/0.4)]">
                              Faol
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground border-border">
                              Nofaol
                            </Badge>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}


// ============= Feedback Two-Panel UI =============
function statusMeta(s?: string | null) {
  const v = (s || "open").toLowerCase();
  if (v === "resolved") return { label: "Resolved", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40", Icon: CheckCircle2 };
  if (v === "pending") return { label: "Pending", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40", Icon: CircleDashed };
  return { label: "Open", cls: "bg-sky-500/15 text-sky-400 border-sky-500/40", Icon: CircleAlert };
}

function FeedbackPanel({ tickets, onChanged }: { tickets: Feedback[]; onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(tickets[0]?.id ?? null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "pending" | "resolved">("all");

  // Realtime: live updates when new feedback arrives or a ticket is updated
  useEffect(() => {
    const channel = supabase
      .channel("feedback-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback" }, () => {
        onChanged();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [onChanged]);

  const filtered = useMemo(
    () => tickets.filter((t) => statusFilter === "all" || (t.status || "open") === statusFilter),
    [tickets, statusFilter]
  );
  const selected = useMemo(
    () => filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );

  useEffect(() => {
    setReply(selected?.admin_reply ?? "");
  }, [selected?.id, selected?.admin_reply]);

  const counts = useMemo(() => {
    const c = { all: tickets.length, open: 0, pending: 0, resolved: 0 } as Record<string, number>;
    tickets.forEach((t) => { c[(t.status || "open")] = (c[(t.status || "open")] || 0) + 1; });
    return c;
  }, [tickets]);

  const send = async (newStatus: "pending" | "resolved") => {
    if (!selected) return;
    const txt = reply.trim();
    if (txt.length < 2) return toast.error("Type a response first");
    setSending(true);
    try {
      const { error } = await supabase.rpc("reply_feedback", {
        _id: selected.id, _reply: txt, _status: newStatus,
      });
      if (error) toast.error(error.message);
      else { toast.success(newStatus === "resolved" ? "Resolved & sent" : "Reply saved"); onChanged(); }
    } finally { setSending(false); }
  };

  return (
    <Card className="border-border/60 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] h-[640px]">
        {/* LEFT: Queue */}
        <div className="border-r border-border/60 flex flex-col bg-card/40">
          <div className="p-4 border-b border-border/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="w-4 h-4 text-primary" />
                <h3 className="font-semibold">Inbox</h3>
                <Badge variant="outline" className="text-xs">{tickets.length}</Badge>
              </div>
            </div>
            <div className="flex gap-1 text-xs">
              {(["all", "open", "pending", "resolved"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex-1 px-2 py-1 rounded border transition-colors capitalize ${
                    statusFilter === s
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s} {counts[s] ? `(${counts[s]})` : ""}
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="flex-1">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No tickets here.
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {filtered.map((t) => {
                  const meta = statusMeta(t.status);
                  const active = selected?.id === t.id;
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => setSelectedId(t.id)}
                        className={`w-full text-left p-4 transition-colors ${
                          active ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-muted/40 border-l-2 border-transparent"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium truncate">{t.user_email}</span>
                          </div>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${meta.cls}`}>
                            <meta.Icon className="w-2.5 h-2.5 mr-0.5" />
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{t.message}</p>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(t.created_at).toLocaleString()}
                          </span>
                          {t.source && t.source !== "web" && (
                            <span className="px-1.5 py-0.5 rounded bg-muted/60 uppercase tracking-wider">{t.source}</span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>

        {/* RIGHT: Chat */}
        <div className="flex flex-col bg-background/40">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a ticket from the inbox to view conversation.
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-border/60 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate">{selected.user_email}</h3>
                    {(() => { const m = statusMeta(selected.status); return (
                      <Badge variant="outline" className={`text-[10px] ${m.cls}`}>
                        <m.Icon className="w-2.5 h-2.5 mr-0.5" />{m.label}
                      </Badge>
                    ); })()}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Ticket #{selected.id.slice(0, 8)} · opened {new Date(selected.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4 max-w-2xl">
                  {/* User message */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                        {selected.user_email[0].toUpperCase()}
                      </div>
                      <span className="text-xs font-medium">{selected.user_email}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(selected.created_at).toLocaleString()}</span>
                    </div>
                    <div className="ml-8 rounded-lg border border-border/60 bg-card/60 p-3 text-sm whitespace-pre-wrap">
                      {selected.message}
                    </div>
                  </div>

                  {/* Admin reply (if exists) */}
                  {selected.admin_reply && (
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-[10px] font-bold text-primary">
                          A
                        </div>
                        <span className="text-xs font-medium text-primary">
                          {selected.admin_responder_email || "Admin"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {selected.admin_responded_at && new Date(selected.admin_responded_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="ml-8 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm whitespace-pre-wrap">
                        {selected.admin_reply}
                      </div>
                      <p className="ml-8 mt-1.5 text-[10px] text-muted-foreground">
                        Responded by: <span className="font-medium text-foreground">{selected.admin_responder_email || "Admin"}</span>
                        {selected.admin_responded_at && <> at {new Date(selected.admin_responded_at).toLocaleString()}</>}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Composer */}
              <div className="border-t border-border/60 p-3 bg-card/40">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type your response..."
                  rows={3}
                  className="resize-none mb-2 bg-background"
                />
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    {selected.admin_reply ? "Editing existing response." : "Reply will be logged with your admin identity."}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={sending} onClick={() => send("pending")}>
                      <CircleDashed className="w-3.5 h-3.5 mr-1.5" /> Save as Pending
                    </Button>
                    <Button size="sm" disabled={sending} onClick={() => send("resolved")}>
                      {sending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                      Send & Resolve
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

// ============= Admin Management =============
interface AdminRow {
  user_id: string;
  email: string;
  role: "owner" | "admin" | string;
  created_at: string;
  fullName: string;
  phone: string;
  location: string;
}

// Deterministic mock for fields we don't store yet (phone/location/fullName)
function enrichAdmin(r: { user_id: string; email: string; role: string; created_at: string }): AdminRow {
  const base = (r.email || "").split("@")[0].replace(/[._]/g, " ");
  const fullName = base.replace(/\b\w/g, (c) => c.toUpperCase()) || "Administrator";
  const cities = ["Tashkent, UZ", "Samarkand, UZ", "Bukhara, UZ", "Almaty, KZ", "Istanbul, TR", "Dubai, AE"];
  const city = cities[Math.abs(r.user_id.charCodeAt(0) + r.user_id.charCodeAt(1)) % cities.length];
  const tail = r.user_id.replace(/\D/g, "").padEnd(7, "0").slice(0, 7);
  const phone = `+998 ${tail.slice(0, 2)} ${tail.slice(2, 5)} ${tail.slice(5, 7)}00`;
  return { ...r, fullName, phone, location: city };
}

function AdminManagement({
  role, currentUserId, targetEmail, setTargetEmail, acting, updateRole,
}: {
  role: string | null;
  currentUserId: string | null;
  targetEmail: string;
  setTargetEmail: (v: string) => void;
  acting: boolean;
  updateRole: (newRole: "admin" | "user") => Promise<void>;
}) {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [permFor, setPermFor] = useState<AdminRow | null>(null);
  const [removeFor, setRemoveFor] = useState<AdminRow | null>(null);
  const [messageFor, setMessageFor] = useState<AdminRow | null>(null);
  const [messageText, setMessageText] = useState("");

  const isOwner = role === "owner";

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_admins");
    if (error) toast.error(error.message);
    else setAdmins(((data as any[]) || []).map(enrichAdmin));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const owner = admins.find((a) => a.role === "owner");
  const others = admins.filter((a) => a.role !== "owner");
  const filterFn = (a: AdminRow) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return a.email.toLowerCase().includes(q) || a.fullName.toLowerCase().includes(q) || a.location.toLowerCase().includes(q);
  };
  const visibleOthers = others.filter(filterFn);

  const handleRemove = async () => {
    if (!removeFor) return;
    setTargetEmail(removeFor.email);
    await updateRole("user");
    setRemoveFor(null);
    await load();
  };

  const handleAdd = async () => {
    await updateRole("admin");
    setAddOpen(false);
    await load();
  };

  const sendMessage = () => {
    if (!messageFor || messageText.trim().length < 2) { toast.error("Type a message"); return; }
    toast.success(`Message sent to ${messageFor.email}`);
    setMessageText("");
    setMessageFor(null);
  };

  return (
    <div className="space-y-12">
      {/* Header + Action Bar */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Admin Management</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage owner and administrator accounts, permissions, and activity.</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search admins by name, email, or location..."
              className="pl-9 bg-card/60 border-border/60"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAddOpen(true)} disabled={!isOwner} className="shadow-[0_0_24px_-12px_hsl(var(--primary))]">
              <Plus className="w-4 h-4 mr-1.5" /> Add Admin
            </Button>
            <Button variant="outline" onClick={() => setActivityOpen(true)}>
              <Activity className="w-4 h-4 mr-1.5" /> Admin Activities
            </Button>
            <Button variant="outline" onClick={() => document.querySelector<HTMLInputElement>('input[placeholder^="Search admins"]')?.focus()}>
              <Search className="w-4 h-4 mr-1.5" /> Search Admin
            </Button>
          </div>
        </div>
      </div>

      {/* Generous whitespace separator */}
      <div className="h-8" />

      {/* List Table */}
      <Card className="border-border/60 bg-card/40 backdrop-blur overflow-hidden">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="w-4 h-4 text-primary" /> Administrators
            <Badge variant="outline" className="ml-2 text-xs">{admins.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                    <th className="px-5 py-3">Full Name</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Phone</th>
                    <th className="px-5 py-3">Location</th>
                    <th className="px-5 py-3">Created</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {owner && <AdminRowItem key={owner.user_id} a={owner} isOwnerRow currentUserId={currentUserId} canManage={isOwner}
                    onPerm={() => setPermFor(owner)} onRemove={() => setRemoveFor(owner)} onMessage={() => setMessageFor(owner)} />}
                  {visibleOthers.map((a) => (
                    <AdminRowItem key={a.user_id} a={a} currentUserId={currentUserId} canManage={isOwner}
                      onPerm={() => setPermFor(a)} onRemove={() => setRemoveFor(a)} onMessage={() => setMessageFor(a)} />
                  ))}
                  {visibleOthers.length === 0 && !owner && (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No administrators found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Admin Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="w-4 h-4 text-primary" /> Promote to Admin</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter the email of an existing user to grant administrator access.</p>
            <Input value={targetEmail} onChange={(e) => setTargetEmail(e.target.value)} placeholder="user@example.com" />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={acting || !targetEmail.trim()}>
                {acting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Grant Admin
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin Activities */}
      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> Admin Activities</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <ul className="divide-y divide-border/40 text-sm">
              {[
                { who: owner?.email || "owner", what: "Updated permissions for an admin", when: "2h ago" },
                { who: "admin@narimon.ai", what: "Resolved feedback ticket #a8c1", when: "5h ago" },
                { who: "admin@narimon.ai", what: "Rotated API key for B2B partner", when: "Yesterday" },
                { who: owner?.email || "owner", what: "Promoted user to admin", when: "2 days ago" },
              ].map((e, i) => (
                <li key={i} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{e.what}</p>
                    <p className="text-xs text-muted-foreground">{e.who}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{e.when}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Remove Confirm */}
      <AlertDialog open={!!removeFor} onOpenChange={(o) => !o && setRemoveFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke admin access?</AlertDialogTitle>
            <AlertDialogDescription>
              This will downgrade <span className="font-medium text-foreground">{removeFor?.email}</span> back to a regular user. They will lose access to the Admin Dashboard immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove Admin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Message Dialog */}
      <Dialog open={!!messageFor} onOpenChange={(o) => { if (!o) { setMessageFor(null); setMessageText(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageCircle className="w-4 h-4 text-primary" /> Message {messageFor?.fullName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Sending to <span className="text-foreground font-medium">{messageFor?.email}</span></p>
            <Textarea rows={5} placeholder="Write your message..." value={messageText} onChange={(e) => setMessageText(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setMessageFor(null); setMessageText(""); }}>Cancel</Button>
              <Button onClick={sendMessage}><Send className="w-4 h-4 mr-1.5" /> Send</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <AdminPermissionsDialog
        open={!!permFor}
        onOpenChange={(o) => !o && setPermFor(null)}
        admin={permFor}
        viewerIsOwner={isOwner}
        viewerId={currentUserId}
      />
    </div>
  );
}

function AdminRowItem({
  a, isOwnerRow, currentUserId, canManage, onPerm, onRemove, onMessage,
}: {
  a: AdminRow; isOwnerRow?: boolean; currentUserId: string | null; canManage: boolean;
  onPerm: () => void; onRemove: () => void; onMessage: () => void;
}) {
  const isSelf = a.user_id === currentUserId;
  return (
    <tr className="border-b border-border/40 transition-colors hover:bg-primary/5">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isOwnerRow ? "bg-primary/20 text-primary border border-primary/40" : "bg-muted text-foreground"}`}>
            {a.fullName[0]?.toUpperCase() || "A"}
          </div>
          <div>
            <div className="font-medium flex items-center gap-2">
              {a.fullName}
              {isOwnerRow && (
                <Badge className="bg-primary/15 text-primary border border-primary/40 shadow-[0_0_12px_hsl(var(--primary)/0.4)]">
                  <Crown className="w-3 h-3 mr-1" /> Owner
                </Badge>
              )}
              {!isOwnerRow && <Badge variant="outline" className="border-border text-muted-foreground">Admin</Badge>}
            </div>
            {isSelf && <p className="text-[10px] text-muted-foreground mt-0.5">You</p>}
          </div>
        </div>
      </td>
      <td className="px-5 py-4 text-muted-foreground">{a.email}</td>
      <td className="px-5 py-4 text-muted-foreground whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Phone className="w-3 h-3" />{a.phone}</span></td>
      <td className="px-5 py-4 text-muted-foreground whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><MapPin className="w-3 h-3" />{a.location}</span></td>
      <td className="px-5 py-4 text-muted-foreground whitespace-nowrap">{new Date(a.created_at).toLocaleDateString()}</td>
      <td className="px-5 py-4 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              disabled={isOwnerRow || !canManage}
              onClick={onRemove}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Remove Admin Status
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPerm}>
              <ShieldCheck className="w-4 h-4 mr-2" /> Admin Permissions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onMessage}>
              <MessageCircle className="w-4 h-4 mr-2" /> Message
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

// ============= Admin Permissions Dialog =============
const PERM_GROUPS: { title: string; icon: React.ReactNode; items: { key: string; label: string; desc: string }[] }[] = [
  {
    title: "Administrative", icon: <Shield className="w-4 h-4" />, items: [
      { key: "grant_admin_status", label: "Grant Admin Status", desc: "Promote other users to admin." },
    ],
  },
  {
    title: "Core System", icon: <Code2 className="w-4 h-4" />, items: [
      { key: "core_script_access", label: "Core Script Access", desc: "Edit production moderation scripts." },
    ],
  },
  {
    title: "Database", icon: <Database className="w-4 h-4" />, items: [
      { key: "db_read", label: "Read Database", desc: "View raw records and analytics." },
      { key: "db_modify", label: "Modify Database", desc: "Insert, update, or delete records." },
    ],
  },
  {
    title: "Promo Codes", icon: <Ticket className="w-4 h-4" />, items: [
      { key: "promo_use", label: "Use Promo Codes", desc: "Apply existing codes to accounts." },
      { key: "promo_create", label: "Create Promo Codes", desc: "Generate new promotional codes." },
      { key: "promo_delete", label: "Delete Promo Codes", desc: "Permanently destroy active codes." },
    ],
  },
];

function AdminPermissionsDialog({
  open, onOpenChange, admin, viewerIsOwner, viewerId,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  admin: AdminRow | null; viewerIsOwner: boolean; viewerId: string | null;
}) {
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const readOnly = !viewerIsOwner || (admin?.role === "owner");

  useEffect(() => {
    if (!open || !admin) return;
    setLoading(true);
    supabase.rpc("get_admin_permissions", { _user_id: admin.user_id }).then(({ data, error }) => {
      if (error) toast.error(error.message);
      else if (data) setPerms(data as any);
      setLoading(false);
    });
  }, [open, admin?.user_id]);

  const toggle = async (key: string, value: boolean) => {
    if (!admin || readOnly) return;
    setSavingKey(key);
    const prev = perms[key];
    setPerms((p) => ({ ...p, [key]: value }));
    const { data, error } = await supabase.rpc("set_admin_permission", { _user_id: admin.user_id, _key: key, _value: value });
    if (error) { toast.error(error.message); setPerms((p) => ({ ...p, [key]: prev })); }
    else if (data) { setPerms(data as any); toast.success("Permission updated"); }
    setSavingKey(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" /> Admin Permissions
            {admin && <span className="text-xs text-muted-foreground font-normal ml-2">{admin.email}</span>}
            {readOnly && <Badge variant="outline" className="ml-2 text-[10px]"><Lock className="w-3 h-3 mr-1" /> Read-only</Badge>}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-5">
              {PERM_GROUPS.map((g) => (
                <div key={g.title} className="rounded-lg border border-border/60 bg-card/40">
                  <div className="px-4 py-2.5 border-b border-border/60 flex items-center gap-2 text-sm font-semibold text-primary">
                    {g.icon} {g.title}
                  </div>
                  <div className="divide-y divide-border/40">
                    {g.items.map((it) => (
                      <div key={it.key} className="flex items-center justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{it.label}</p>
                          <p className="text-xs text-muted-foreground">{it.desc}</p>
                        </div>
                        <Switch
                          checked={!!perms[it.key]}
                          disabled={readOnly || savingKey === it.key}
                          onCheckedChange={(v) => toggle(it.key, v)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}


export default function AdminDashboard() {
  return (
    <ProUpgradeProvider>
      <AdminDashboardInner />
    </ProUpgradeProvider>
  );
}

function RecommendationCard() {
  const { open } = useUpgradeModal();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      className="relative flex items-start gap-3 rounded-xl p-4 pr-10
        bg-white/[0.03] backdrop-blur-xl
        border border-white/10
        animate-in fade-in slide-in-from-bottom-3 duration-500"
    >
      <div className="rounded-lg bg-neon/15 text-neon p-2 shrink-0">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="text-sm leading-relaxed">
        <span className="font-medium text-foreground">Pro tip:</span>{" "}
        <span className="text-muted-foreground">Your logs are growing fast.</span>{" "}
        <button
          onClick={open}
          className="text-neon hover:underline underline-offset-2 font-medium"
        >
          Switch to Pro to optimize storage →
        </button>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

const STORAGE_TABLES = [
  { name: "Users", share: 0.18, color: "hsl(var(--neon-glow))" },
  { name: "Logs", share: 0.42, color: "hsl(var(--cyan))" },
  { name: "Media", share: 0.26, color: "hsl(var(--purple))" },
  { name: "Analytics", share: 0.14, color: "hsl(var(--primary))" },
];

function StorageBreakdown({ usedBytes, limitBytes }: { usedBytes: number; limitBytes: number }) {
  const pct = limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100) : 0;
  const fmtSize = (b: number) => {
    if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + " MB";
    if (b >= 1024) return (b / 1024).toFixed(1) + " KB";
    return b + " B";
  };
  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="w-5 h-5 text-primary" /> Storage Usage Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">{fmtSize(usedBytes)} used</span>
            <span className="text-muted-foreground">/ {fmtSize(limitBytes)}</span>
          </div>
          <div className="relative h-2 w-full rounded-full bg-muted/40 overflow-hidden">
            <div className="absolute inset-y-0 left-0 flex">
              {STORAGE_TABLES.map((t) => (
                <div
                  key={t.name}
                  style={{ width: `${pct * t.share}%`, background: t.color }}
                  className="h-full transition-all"
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{pct.toFixed(2)}% of quota</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STORAGE_TABLES.map((t) => {
            const tBytes = usedBytes * t.share;
            return (
              <div
                key={t.name}
                className="rounded-lg border border-border/60 bg-background/40 p-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: t.color, boxShadow: `0 0 8px ${t.color}` }}
                    />
                    <span className="text-sm font-medium text-foreground">{t.name}</span>
                  </div>
                  <CheckCircle2 className="w-3 h-3 text-muted-foreground" />
                </div>
                <p className="text-lg font-semibold tracking-tight text-foreground">
                  {fmtSize(tBytes)}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                  {(t.share * 100).toFixed(0)}% of used
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
