import { Link, useLocation } from "react-router-dom";
import { Brain, FileText, Image, Video, Zap, Shield, KeyRound, LogIn, LogOut, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProUpgradeButton } from "@/components/admin/ProUpgradeModal";

interface NavItem {
  path: string;
  label: string;
  icon: any;
}

export default function Navbar() {
  const location = useLocation();
  const { session, role, user } = useAuth();
  const [hasRadarAccess, setHasRadarAccess] = useState(false);
  const hasAdminAccess = !!session && (role === "admin" || role === "owner");

  // Brauzer Radar: owner OR an admin listed in any flag's allowed_admin_emails
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (role === "owner") {
        if (!cancelled) setHasRadarAccess(true);
        return;
      }
      if (role === "admin" && user?.email) {
        const { data } = await supabase
          .from("system_flags")
          .select("allowed_admin_emails");
        const ok = !!data?.some((r: any) =>
          (r.allowed_admin_emails ?? []).includes(user.email!)
        );
        if (!cancelled) setHasRadarAccess(ok);
      } else {
        if (!cancelled) setHasRadarAccess(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, user?.email]);

  const items: NavItem[] = [
    { path: "/", label: "Bosh sahifa", icon: Zap },
    { path: "/text-analysis", label: "Matn", icon: FileText },
    { path: "/image-analysis", label: "Rasm", icon: Image },
    { path: "/video-analysis", label: "Video", icon: Video },
    { path: "/api", label: "API", icon: KeyRound },
  ];

  if (hasRadarAccess) {
    items.splice(1, 0, { path: "/extension", label: "Brauzer Radar", icon: Shield });
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/60 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="relative">
              <Brain className="w-8 h-8 text-primary animate-pulse-glow" />
              <div className="absolute inset-0 blur-lg bg-primary/30 rounded-full" />
            </div>
            <span className="text-xl font-bold tracking-tight hidden sm:inline">
              <span className="text-primary text-glow">AI</span>
              <span className="text-foreground"> Content Insights</span>
            </span>
          </Link>

          <div className="flex items-center gap-1 overflow-x-auto">
            {items.map(({ path, label, icon: Icon }) => {
              const active = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    active
                      ? "bg-primary/10 text-primary glow-green"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}

            {hasAdminAccess && (
              <Link
                to="/admin-dashboard"
                className={`flex shrink-0 items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 border ${
                  location.pathname === "/admin-dashboard"
                    ? "bg-primary/10 text-primary border-primary/40 glow-green"
                    : "text-primary border-primary/30 bg-primary/5 hover:bg-primary/10"
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden md:inline">Admin Dashboard</span>
              </Link>
            )}

            <div className="ml-1">
              <ProUpgradeButton />
            </div>

            {!session ? (
              <Link
                to="/auth"
                className="ml-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden md:inline">Kirish</span>
              </Link>
            ) : (
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = "/auth";
                }}
                className="ml-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden md:inline">Chiqish</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </nav>
  );
}

