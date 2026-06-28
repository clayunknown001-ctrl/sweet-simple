import { Link, NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { LogIn, LogOut, LayoutDashboard, Menu, X } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/narimon-hero.jpg";
import NotificationBell from "@/components/NotificationBell";

const items = [
  { to: "/ai", label: "Narimon AI" },
  { to: "/browser", label: "Narimon Brauzer" },
  { to: "/about", label: "Biz haqimizda" },
];

export default function Navbar() {
  const { user, role, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const isAdmin = role === "admin" || role === "owner";

  return (
    <div className="fixed top-4 left-0 right-0 z-50 px-4 pointer-events-none">
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="pointer-events-auto mx-auto max-w-6xl rounded-2xl border border-[rgba(0,255,170,0.15)] bg-[#0B1015]/70 backdrop-blur-xl shadow-[0_0_40px_rgba(0,229,142,0.08)]"
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-2.5">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="relative w-9 h-9 rounded-lg overflow-hidden border border-[rgba(0,255,170,0.25)] bg-[#0B1015]">
              <img src={logo} alt="" className="w-full h-full object-cover scale-150" />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-bold text-[#F4F6F8]">Narimon</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#00E58E]">Ecosystem</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                className={({ isActive }) =>
                  `px-3.5 py-2 rounded-xl text-sm transition-all ${
                    isActive
                      ? "bg-[#00E58E]/10 text-[#00E58E] border border-[rgba(0,229,142,0.3)]"
                      : "text-[#97A2AE] hover:text-[#F4F6F8] border border-transparent"
                  }`
                }
              >
                {it.label}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />

            {!user ? (
              <Link
                to="/login"
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm text-[#F4F6F8] border border-[rgba(0,255,170,0.18)] hover:border-[rgba(0,255,170,0.4)] transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Login
              </Link>
            ) : (
              <button
                onClick={signOut}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm text-[#97A2AE] hover:text-[#F4F6F8] border border-transparent hover:border-[rgba(0,255,170,0.2)] transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            )}

            {isAdmin && (
              <Link
                to="/dashboard"
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-[#04140B] bg-gradient-to-r from-[#00E58E] to-[#1CF7D2] shadow-[0_0_20px_rgba(0,229,142,0.3)]"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>
            )}

            <button
              className="md:hidden p-2 rounded-lg text-[#F4F6F8]"
              onClick={() => setOpen((v) => !v)}
              aria-label="menu"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="md:hidden border-t border-[rgba(0,255,170,0.1)] px-3 py-3 flex flex-col gap-1">
            {items.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                onClick={() => setOpen(false)}
                className={`px-3 py-2 rounded-lg text-sm ${
                  loc.pathname === it.to ? "bg-[#00E58E]/10 text-[#00E58E]" : "text-[#F4F6F8]"
                }`}
              >
                {it.label}
              </Link>
            ))}
            {!user ? (
              <Link to="/login" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg text-sm text-[#F4F6F8]">
                Login
              </Link>
            ) : (
              <button onClick={() => { signOut(); setOpen(false); }} className="text-left px-3 py-2 rounded-lg text-sm text-[#F4F6F8]">
                Logout
              </button>
            )}
            {isAdmin && (
              <Link to="/dashboard" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg text-sm text-[#00E58E]">
                Dashboard
              </Link>
            )}
          </div>
        )}
      </motion.nav>
    </div>
  );
}
