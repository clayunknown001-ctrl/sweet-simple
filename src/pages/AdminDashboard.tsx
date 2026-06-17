import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Users, DollarSign, TrendingUp, HardDrive, Lock, LogOut, KeyRound, Cpu } from "lucide-react";
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

const fmt = (n: number) => new Intl.NumberFormat().format(n);
const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const mb = (b: number) => (b / 1024 / 1024).toFixed(1) + " MB";

export default function AdminDashboard() {
  const { role, signOut, user } = useAuth();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetEmail, setTargetEmail] = useState("");
  const [acting, setActing] = useState(false);

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

          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Kpi icon={<Users />} label="Total Subscribers" value={fmt(analytics?.total_users_count ?? 0)} />
              <Kpi icon={<DollarSign />} label="Monthly Revenue" value={usd(analytics?.monthly_revenue ?? 0)} />
              <Kpi icon={<TrendingUp />} label="All-Time Profit" value={usd(analytics?.all_time_profit ?? 0)} />
            </div>

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
