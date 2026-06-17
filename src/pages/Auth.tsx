import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const schema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "Min 6 chars").max(72),
});

export default function Auth() {
  const navigate = useNavigate();
  const { session, role, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session && role) {
      navigate(role === "admin" || role === "owner" ? "/admin-dashboard" : "/", { replace: true });
    }
  }, [session, role, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
            toast.error("Account does not exist or wrong password. Please click 'Create Account' first.");
          } else {
            toast.error(error.message);
          }
          return;
        }
        toast.success("Signed in");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) {
          if (error.message.toLowerCase().includes("already registered")) {
            toast.error("Account already exists. Please sign in.");
            setMode("signin");
          } else toast.error(error.message);
          return;
        }
        toast.success("Account created. You're signed in.");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Unexpected error");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message || "Google sign-in failed");
        return;
      }
      if (result.redirected) return;
    } catch (err: any) {
      toast.error(err?.message ?? "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <h1 className="text-2xl font-bold mb-1">Welcome Back</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {mode === "signin" ? "Sign in to your account" : "Create your account"}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {mode === "signin" ? "Sign In" : "Create Account"}
          </Button>
        </form>

        <div className="my-4 text-center text-sm text-muted-foreground">or continue with</div>
        <Button variant="outline" className="w-full" onClick={google} disabled={busy}>
          Google
        </Button>

        <button
          type="button"
          className="mt-6 text-sm text-primary hover:underline w-full text-center"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "No account? Create Account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
