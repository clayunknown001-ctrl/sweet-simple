import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, type AppRole } from "@/hooks/useAuth";

export function RequireRole({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { user, role, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050607] text-[#97A2AE]">
        Yuklanmoqda...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!role || !roles.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
