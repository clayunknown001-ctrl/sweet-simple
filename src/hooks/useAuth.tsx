import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "user" | "admin" | "owner";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  refreshRole: () => Promise<AppRole | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRole = async (uid: string): Promise<AppRole> => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid);

    if (error || !data || data.length === 0) {
      setRole("user");
      return "user";
    }

    const roles = data.map((r: any) => r.role as AppRole);
    const nextRole = roles.includes("owner") ? "owner" : roles.includes("admin") ? "admin" : "user";
    setRole(nextRole);
    return nextRole;
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setLoading(true);
        setTimeout(() => {
          loadRole(s.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    supabase.auth.getUser().then(({ data: { user: verifiedUser } }) => {
      if (!verifiedUser) {
        setSession(null);
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
        setUser(verifiedUser);
        loadRole(verifiedUser.id).finally(() => setLoading(false));
      });
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshRole = async () => {
    if (!user) return null;
    return loadRole(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
  };

  return (
    <Ctx.Provider value={{ session, user, role, loading, refreshRole, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
