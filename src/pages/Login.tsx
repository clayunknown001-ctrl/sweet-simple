import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, LogIn } from "lucide-react";
import Navbar from "@/components/Navbar";
import Particles from "@/components/Particles";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Tizimga kirildi");
    nav("/");
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error("Google login xatosi");
  };

  const forgot = async () => {
    if (!email) return toast.error("Email kiriting");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Parolni tiklash xati yuborildi");
  };

  return (
    <div className="min-h-screen bg-[#050607] text-[#F4F6F8] relative">
      <Navbar />
      <Particles count={18} />
      <div className="relative min-h-screen flex items-center justify-center px-4 pt-28 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md rounded-2xl border border-[rgba(0,255,170,0.15)] bg-[#0B1015]/90 backdrop-blur-xl p-8 shadow-[0_0_60px_rgba(0,229,142,0.1)]"
        >
          <h1 className="text-3xl font-bold text-center">Tizimga kirish</h1>
          <p className="text-center text-sm text-[#97A2AE] mt-2">Narimon Ecosystem hisobingizga kiring</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div>
              <label className="text-xs text-[#97A2AE]">Email</label>
              <div className="mt-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#97A2AE]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#050607] border border-[rgba(0,255,170,0.15)] focus:border-[#00E58E] outline-none text-sm"
                  placeholder="siz@example.com"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#97A2AE]">Parol</label>
              <div className="mt-1 relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#97A2AE]" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#050607] border border-[rgba(0,255,170,0.15)] focus:border-[#00E58E] outline-none text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-[#97A2AE]">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-[#00E58E]" />
                Meni eslab qol
              </label>
              <button type="button" onClick={forgot} className="text-[#00E58E] hover:underline">
                Parolni unutdingizmi?
              </button>
            </div>
            <button
              disabled={busy}
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#00E58E] to-[#1CF7D2] text-[#04140B] font-semibold shadow-[0_0_28px_rgba(0,229,142,0.35)] disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              {busy ? "Kirilmoqda..." : "Kirish"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-[#97A2AE]">
            <div className="flex-1 h-px bg-[rgba(0,255,170,0.1)]" />
            yoki
            <div className="flex-1 h-px bg-[rgba(0,255,170,0.1)]" />
          </div>

          <button
            onClick={google}
            className="w-full py-3 rounded-xl border border-[rgba(0,255,170,0.2)] bg-[#050607] text-sm hover:border-[rgba(0,255,170,0.45)]"
          >
            Google bilan kirish
          </button>

          <div className="text-center text-xs text-[#97A2AE] mt-5">
            Hisobingiz yo'qmi?{" "}
            <Link to="/login" className="text-[#00E58E] hover:underline">
              Ro'yxatdan o'tish
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
