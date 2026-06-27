import { Link } from "react-router-dom";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { KeyRound, Image as ImageIcon, Bell, ChevronRight, Users, Crown, Star, BarChart3, Sparkles, Zap, CheckCircle2, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import heroImage from "@/assets/narimon-hero.jpg";

function useCountUp(target: number, duration = 1600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.floor(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  suffix = "",
  decimals = 0,
  hint,
  delay = 0,
}: {
  icon: any;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  hint: React.ReactNode;
  delay?: number;
}) {
  const count = useCountUp(value);
  const display = decimals > 0 ? (count / Math.pow(10, decimals)).toFixed(decimals) : count.toLocaleString("en-US");
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: "easeOut" }}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-[rgba(0,255,170,0.12)] bg-[#0B1015] p-5 transition-shadow hover:shadow-[0_0_30px_rgba(0,229,142,0.12)]"
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-[#97A2AE] mb-1">{label}</div>
          <div className="text-2xl font-bold text-[#F4F6F8] tracking-tight">
            {display}{suffix}
          </div>
        </div>
      </div>
      <div className="mt-3 text-xs text-[#97A2AE]">{hint}</div>
    </motion.div>
  );
}

function Particles() {
  const dots = Array.from({ length: 28 });
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((_, i) => {
        const left = (i * 37) % 100;
        const top = (i * 53) % 100;
        const delay = (i % 8) * 0.6;
        const size = 2 + (i % 3);
        return (
          <motion.span
            key={i}
            className="absolute rounded-full bg-[#1CF7D2]"
            style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, boxShadow: "0 0 8px rgba(28,247,210,0.7)" }}
            animate={{ y: [0, -14, 0], opacity: [0.2, 0.9, 0.2] }}
            transition={{ duration: 4 + (i % 5), repeat: Infinity, delay, ease: "easeInOut" }}
          />
        );
      })}
    </div>
  );
}

export default function Index() {
  // Parallax around hero image
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 15 });
  const sy = useSpring(my, { stiffness: 60, damping: 15 });
  const tx = useTransform(sx, (v) => v * 14);
  const ty = useTransform(sy, (v) => v * 14);
  const heroRef = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent) => {
    const r = heroRef.current?.getBoundingClientRect();
    if (!r) return;
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 2);
    my.set(((e.clientY - r.top) / r.height - 0.5) * 2);
  };

  return (
    <div className="min-h-screen bg-[#050607] text-[#F4F6F8]">
      <Navbar />

      {/* HERO */}
      <section
        ref={heroRef}
        onMouseMove={onMove}
        className="relative container mx-auto px-4 pt-24 sm:pt-28 pb-10"
      >
        <Particles />

        {/* Floating notification card */}
        <motion.a
          href="https://narimon.uz"
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="hidden md:flex absolute right-4 top-24 z-10 items-center gap-3 px-4 py-2.5 rounded-xl border border-[rgba(0,255,170,0.18)] bg-[#0B1015]/90 backdrop-blur-xl hover:border-[rgba(0,255,170,0.4)] transition-colors group"
        >
          <Bell className="w-4 h-4 text-[#00E58E]" />
          <div className="text-[13px] leading-tight">
            <div className="text-[#F4F6F8]">Narimon Ecosystem haqida</div>
            <div className="text-[#97A2AE]">ko'proq ma'lumot oling</div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#97A2AE] group-hover:text-[#00E58E] group-hover:translate-x-0.5 transition-all" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#00E58E] shadow-[0_0_10px_#00E58E]" />
        </motion.a>

        <div className="grid lg:grid-cols-2 gap-10 items-center relative">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <h1 className="text-4xl sm:text-5xl lg:text-[58px] font-bold leading-[1.05] tracking-tight">
              <span className="text-[#00E58E] drop-shadow-[0_0_24px_rgba(0,229,142,0.45)]">AI</span>{" "}
              <span className="text-[#F4F6F8]">bilan ishlaydigan</span>
              <br />
              <span className="text-[#F4F6F8]">kontent tahlil platformasi</span>
            </h1>
            <p className="mt-5 text-[15px] sm:text-base text-[#97A2AE] max-w-xl leading-relaxed">
              Matn, rasm va video kontentlarni chuqur tahlil qiling, xavfni aniqlang,
              sifatni oshiring va samaradorlikni kuchaytiring.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/api"
                className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#00E58E] to-[#1CF7D2] text-[#04140B] font-semibold shadow-[0_0_30px_rgba(0,229,142,0.35)] hover:shadow-[0_0_40px_rgba(0,229,142,0.55)] transition-shadow"
              >
                <KeyRound className="w-4 h-4" />
                API kalit olish
              </Link>
              <Link
                to="/image-analysis"
                className="flex items-center gap-2 px-6 py-3.5 rounded-xl border border-[rgba(0,255,170,0.18)] bg-[#0B1015] text-[#F4F6F8] hover:border-[rgba(0,255,170,0.4)] transition-colors"
              >
                <ImageIcon className="w-4 h-4 text-[#00E58E]" />
                Rasm sinash
              </Link>
            </div>
          </motion.div>

          {/* Right hero image */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="relative"
          >
            <motion.div style={{ x: tx, y: ty }} className="relative">
              <div className="absolute inset-0 blur-3xl bg-[#00E58E]/20 rounded-full" />
              <motion.img
                src={heroImage}
                alt="Narimon AI holographic platform"
                width={1280}
                height={1024}
                className="relative w-full max-w-[560px] mx-auto select-none"
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* STATS */}
      <section className="container mx-auto px-4 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            iconBg="bg-[#00E58E]/10"
            iconColor="text-[#00E58E]"
            label="Jami foydalanuvchilar"
            value={12540}
            hint={<span className="text-[#00E58E]">↗ 12.3% o'tgan oyga nisbatan</span>}
            delay={0.05}
          />
          <StatCard
            icon={Crown}
            iconBg="bg-[#FFB020]/10"
            iconColor="text-[#FFB020]"
            label="Pro foydalanuvchilar"
            value={2340}
            hint={<span className="text-[#00E58E]">↗ 8.2% o'tgan oyga nisbatan</span>}
            delay={0.15}
          />
          <StatCard
            icon={Star}
            iconBg="bg-[#FFB020]/10"
            iconColor="text-[#FFB020]"
            label="Umumiy baho"
            value={48}
            decimals={1}
            suffix=" / 5"
            hint="1,248 ta baho asosida"
            delay={0.25}
          />
          <StatCard
            icon={BarChart3}
            iconBg="bg-[#00E58E]/10"
            iconColor="text-[#00E58E]"
            label="Tahlil qilingan kontent"
            value={85600}
            suffix="+"
            hint="Matn, rasm va video"
            delay={0.35}
          />
        </div>
      </section>

      {/* BOTTOM TWO CARDS */}
      <section className="container mx-auto px-4 pb-20">
        <div className="grid lg:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="rounded-2xl border border-[rgba(0,255,170,0.12)] bg-[#0B1015] p-6 sm:p-8"
          >
            <h3 className="text-2xl font-bold text-[#F4F6F8] mb-4">Loyiha haqida</h3>
            <p className="text-[#97A2AE] leading-relaxed mb-6">
              AI Content Insights — bu matn, rasm va videolarni sun'iy intellekt
              yordamida tahlil qiluvchi zamonaviy platforma. Biz kontentning
              sifatini oshirish, xavfni topish va samaradorlikni kuchaytirishga
              yordam beramiz.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { icon: Sparkles, label: "AI Texnologiya" },
                { icon: Zap, label: "Tezkor tahlil" },
                { icon: CheckCircle2, label: "Aniq natija" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[rgba(0,255,170,0.15)] bg-[#050607]/60 text-sm text-[#F4F6F8]">
                  <Icon className="w-4 h-4 text-[#00E58E]" />
                  {label}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="rounded-2xl border border-[rgba(0,255,170,0.12)] bg-[#0B1015] p-6 sm:p-8"
          >
            <h3 className="text-2xl font-bold text-[#F4F6F8] mb-4">Qanday ishlaydi?</h3>
            <div className="relative aspect-video rounded-xl overflow-hidden border border-[rgba(0,255,170,0.12)] bg-gradient-to-br from-[#031A14] via-[#04201A] to-[#050607] flex items-center justify-center group cursor-pointer">
              <div className="absolute inset-0 opacity-50" style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 30%, rgba(28,247,210,0.25), transparent 40%), radial-gradient(circle at 80% 70%, rgba(0,229,142,0.2), transparent 40%)",
              }} />
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className="relative w-16 h-16 rounded-full bg-[#F4F6F8]/90 flex items-center justify-center shadow-[0_0_40px_rgba(0,229,142,0.4)]"
                aria-label="Play video"
              >
                <Play className="w-7 h-7 text-[#050607] ml-1" fill="currentColor" />
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
