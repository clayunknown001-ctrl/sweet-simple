import { useEffect, useState } from "react";
import { supabase as _sb } from "@/integrations/supabase/client";
const supabase: any = _sb;
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Lock, ShieldCheck, Cpu, Cloud } from "lucide-react";
import { toast } from "sonner";

interface Flag {
  id: number;
  flag_name: string;
  staging_value: boolean;
  production_value: boolean;
  allowed_admin_emails: string[];
  description: string | null;
  updated_at: string;
}

export default function CoreScriptConfig() {
  const { role } = useAuth();
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [grantEmail, setGrantEmail] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("system_flags")
      .select("*")
      .order("id");
    if (error) toast.error(error.message);
    else setFlags((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (flag: Flag, channel: "staging" | "production", value: boolean) => {
    setBusy(`${flag.flag_name}-${channel}`);
    const { error } = await supabase.rpc("set_system_flag", {
      _flag_name: flag.flag_name,
      _value: value,
      _channel: channel,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(
        `${channel === "staging" ? "Staging" : "Production"} updated. ${
          channel === "staging" ? "Promote when verified." : ""
        }`
      );
      await load();
    }
    setBusy(null);
  };

  const grant = async (flag: Flag) => {
    const email = grantEmail[flag.flag_name]?.trim();
    if (!email) return toast.error("Enter an admin email");
    setBusy(`grant-${flag.flag_name}`);
    const { error } = await supabase.rpc("grant_flag_admin", {
      _flag_name: flag.flag_name,
      _email: email,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Admin granted access");
      setGrantEmail((s) => ({ ...s, [flag.flag_name]: "" }));
      await load();
    }
    setBusy(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (flags.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Lock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold">No access</p>
          <p className="text-sm text-muted-foreground">
            You are not listed as an authorized admin for any core script flag.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="w-4 h-4 text-primary" /> Core Script — bu nima?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3 text-muted-foreground">
          <p>
            <strong className="text-foreground">Core Script</strong> — bu brauzerda
            ishlaydigan moderatsiya yadrosi (<code className="px-1 bg-muted rounded">monitor.js</code>),
            u har bir sahifadagi rasm/video/matnni kuzatadi va zararli kontentni bloklaydi.
            Bu yerdan uning <em>ishlash rejimi</em> va kim qaysi flagni o'zgartira olishini boshqarasiz.
          </p>
          <div className="grid md:grid-cols-2 gap-3 pt-1">
            <div className="border border-border rounded-lg p-3 bg-background">
              <p className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                <Cpu className="w-3.5 h-3.5" /> Local / Edge Client Mode <Badge variant="outline" className="ml-1">ON</Badge>
              </p>
              <p className="text-xs">
                Transformers.js + ONNX brauzerda ishlaydi. Tashqi API'ga so'rov yo'q.
                Tezroq, arzon, oflayn ishlaydi. <strong>Zaif tomonlari:</strong> birinchi yuklash og'irroq,
                eski qurilmalarda sekinroq.
              </p>
            </div>
            <div className="border border-border rounded-lg p-3 bg-background">
              <p className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                <Cloud className="w-3.5 h-3.5" /> API Hybrid Mode <Badge variant="outline" className="ml-1">OFF</Badge>
              </p>
              <p className="text-xs">
                Og'ir tahlillar bizning <code className="px-1 bg-muted rounded">analyze-*</code> edge
                funksiyalariga yuboriladi. <strong>Aniqroq</strong> natijalar, lekin har bir so'rov
                kvota ishlatadi va tarmoq talab qiladi.
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-border space-y-1.5">
            <p className="text-foreground font-semibold">Qanday ishlatish kerak:</p>
            <ul className="list-disc pl-5 text-xs space-y-1">
              <li><strong>Staging</strong> — sinov kanali. Har qanday admin (ruxsati bo'lsa) o'zgartira oladi. Faqat dev/test brauzerlarga ta'sir qiladi.</li>
              <li><strong>Production</strong> — real foydalanuvchilar. Faqat <em>owner</em> yoqa/o'chira oladi.</li>
              <li><strong>Authorized admin emails</strong> — owner muayyan adminlarga ushbu flagni boshqarishga ruxsat beradi.</li>
              <li>Avval staging'da sinab ko'ring → keyin production'ga ko'taring.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-500 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Staging-first writes</p>
            <p className="text-muted-foreground">
              O'zgarishlar avval <Badge variant="outline">staging</Badge> kanaliga yoziladi.
              Faqat owner uni <Badge variant="outline">production</Badge>'ga ko'tara oladi.
            </p>
          </div>
        </CardContent>
      </Card>

      {flags.map((flag) => {
        const isLocal = flag.flag_name === "enable_local_ai_inference";
        return (
          <Card key={flag.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isLocal ? <Cpu className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
                {flag.flag_name}
              </CardTitle>
              {flag.description && (
                <p className="text-xs text-muted-foreground">{flag.description}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ChannelRow
                  label="Staging"
                  value={flag.staging_value}
                  busy={busy === `${flag.flag_name}-staging`}
                  onChange={(v) => toggle(flag, "staging", v)}
                  hint={flag.staging_value ? "Local/Edge Client Mode" : "API Hybrid Mode"}
                />
                <ChannelRow
                  label="Production"
                  value={flag.production_value}
                  busy={busy === `${flag.flag_name}-production`}
                  onChange={(v) => toggle(flag, "production", v)}
                  hint={flag.production_value ? "Local/Edge Client Mode" : "API Hybrid Mode"}
                  ownerOnly={role !== "owner"}
                />
              </div>

              <div>
                <p className="text-xs font-medium mb-1.5">Authorized admin emails</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {flag.allowed_admin_emails.length === 0 ? (
                    <span className="text-xs text-muted-foreground">None</span>
                  ) : (
                    flag.allowed_admin_emails.map((e) => (
                      <Badge key={e} variant="secondary">{e}</Badge>
                    ))
                  )}
                </div>
                {role === "owner" && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="admin@example.com"
                      value={grantEmail[flag.flag_name] ?? ""}
                      onChange={(e) =>
                        setGrantEmail((s) => ({ ...s, [flag.flag_name]: e.target.value }))
                      }
                    />
                    <Button
                      onClick={() => grant(flag)}
                      disabled={busy === `grant-${flag.flag_name}`}
                    >
                      Grant
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ChannelRow({
  label, value, busy, onChange, hint, ownerOnly,
}: {
  label: string;
  value: boolean;
  busy: boolean;
  onChange: (v: boolean) => void;
  hint: string;
  ownerOnly?: boolean;
}) {
  return (
    <div className="border border-border rounded-lg p-3 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium flex items-center gap-2">
          {label}
          {ownerOnly && <Lock className="w-3 h-3 text-muted-foreground" />}
        </p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        {busy && <Loader2 className="w-3 h-3 animate-spin" />}
        <Switch checked={value} onCheckedChange={onChange} disabled={busy || ownerOnly} />
      </div>
    </div>
  );
}
