import { Link, useLocation } from "react-router-dom";
import { FileText, Image, Video, Zap, Shield, KeyRound, LogIn, LogOut, LayoutDashboard, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUpgradeModal } from "@/components/admin/ProUpgradeModal";

interface NavItem {
  path: string;
  label: string;
  icon: any;
}

export default function Navbar() {
  const location = useLocation();
  const { session, role, user } = useAuth();
  const { open: openUpgrade } = useUpgradeModal();
  const [hasRadarAccess, setHasRadarAccess] = useState(false);
  const hasAdminAccess = !!session && (role === "admin" || role === "owner");

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
    return () => { cancelled = true; };
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
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[rgba(0,255,170,0.12)] bg-[#050607]/80 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="relative w-9 h-9 rounded-xl border border-[rgba(0,255,170,0.25)] bg-[#0B1015] flex items-center justify-center">
              <span className="text-[#00E58E] font-bold text-lg drop-shadow-[0_0_8px_rgba(0,229,142,0.7)]">N</span>
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-[#F4F6F8] hidden sm:inline">
              AI Content Insights
            </span>
          </Link>

          {/* Center nav */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {items.map(({ path, label, icon: Icon }) => {
              const active = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? "text-[#00E58E]"
                      : "text-[#97A2AE] hover:text-[#F4F6F8]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => openUpgrade()}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-[#F4F6F8] border border-[rgba(0,255,170,0.18)] bg-[#0B1015] hover:border-[rgba(0,255,170,0.4)] transition-colors"
            >
              <Star className="w-4 h-4 text-[#00E58E]" />
              <span className="hidden md:inline">Upgrade</span>
            </button>

            {!session ? (
              <Link
                to="/auth"
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-[#F4F6F8] border border-[rgba(0,255,170,0.18)] bg-[#0B1015] hover:border-[rgba(0,255,170,0.4)] transition-colors"
              >
                <LogIn className="w-4 h-4 text-[#00E58E]" />
                <span className="hidden md:inline">Kirish</span>
              </Link>
            ) : (
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = "/auth";
                }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-[#F4F6F8] border border-[rgba(0,255,170,0.18)] bg-[#0B1015] hover:border-[rgba(0,255,170,0.4)] transition-colors"
              >
                <LogOut className="w-4 h-4 text-[#00E58E]" />
                <span className="hidden md:inline">Chiqish</span>
              </button>
            )}

            {hasAdminAccess && (
              <Link
                to="/admin-dashboard"
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  location.pathname === "/admin-dashboard"
                    ? "border-[#00E58E] text-[#00E58E] bg-[#00E58E]/5"
                    : "border-[rgba(0,255,170,0.35)] text-[#00E58E] hover:bg-[#00E58E]/5"
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden lg:inline">Admin Dashboard</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
