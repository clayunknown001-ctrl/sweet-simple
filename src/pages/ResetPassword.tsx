import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { KeyRound } from "lucide-react";
import Navbar from "@/components/Navbar";
import Particles from "@/components/Particles";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ResetPassword() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Parol kamida 6 ta belgidan iborat bo‘lsin");
    if (password !== confirm) return toast.error("Parollar mos emas");

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) return toast.error(error.message);
    toast.success("Parol yangilandi. Endi email va parol bilan kirishingiz mumkin.");
    nav("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#050607] text-[#F4F6F8] relative">
      <Navbar />
      <Particles count={18} />
      <div className="relative min-h-screen flex items-center justify-center px-4 pt-28 pb-12">
        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md rounded-2xl border border-[rgba(0,255,170,0.15)] bg-[#0B1015]/90 backdrop-blur-xl p-8 shadow-[0_0_60px_rgba(0,229,142,0.1)]"
        >
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-[rgba(0,255,170,0.25)] bg-[#050607] text-[#00E58E]">
            <KeyRound className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-bold text-center">Yangi parol</h1>
          <p className="text-center text-sm text-[#97A2AE] mt-2">
            Google bilan kirgan hisobingiz uchun email/parol kirishni ham yoqing.
          </p>

          {!ready && (
            <p className="mt-6 rounded-xl border border-[rgba(0,255,170,0.12)] bg-[#050607] p-3 text-sm text-[#97A2AE]">
              Avval emailingizga kelgan parol tiklash havolasini oching.
            </p>
          )}

          <div className="mt-7 space-y-4">
            <div>
              <label className="text-xs text-[#97A2AE]">Yangi parol</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[#050607] border border-[rgba(0,255,170,0.15)] focus:border-[#00E58E] outline-none text-sm"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="text-xs text-[#97A2AE]">Parolni tasdiqlang</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[#050607] border border-[rgba(0,255,170,0.15)] focus:border-[#00E58E] outline-none text-sm"
                placeholder="••••••••"
              />
            </div>
            <button
              disabled={busy || !ready}
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#00E58E] to-[#1CF7D2] text-[#04140B] font-semibold shadow-[0_0_28px_rgba(0,229,142,0.35)] disabled:opacity-60"
            >
              {busy ? "Saqlanmoqda..." : "Parolni saqlash"}
            </button>
          </div>
        </motion.form>
      </div>
    </div>
  );
}