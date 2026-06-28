import { Link } from "react-router-dom";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Brain, Globe, ChevronRight, Users, Shield, Rocket, Info } from "lucide-react";
import { useRef } from "react";
import Navbar from "@/components/Navbar";
import Particles from "@/components/Particles";
import Footer from "@/components/Footer";
import heroImage from "@/assets/narimon-hero.jpg";

export default function Index() {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 15 });
  const sy = useSpring(my, { stiffness: 60, damping: 15 });
  const tx = useTransform(sx, (v) => v * 14);
  const ty = useTransform(sy, (v) => v * 14);
  const rotX = useTransform(sy, (v) => v * -6);
  const rotY = useTransform(sx, (v) => v * 6);
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

      <section
        ref={heroRef}
        onMouseMove={onMove}
        className="relative container mx-auto px-4 pt-28 sm:pt-32 pb-16 overflow-hidden"
        style={{ minHeight: "min(100vh, 920px)" }}
      >
        <Particles />

        <div className="relative z-10 grid items-center gap-10 md:gap-8 md:grid-cols-[minmax(320px,48%)_minmax(420px,52%)]">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <h1 className="text-5xl md:text-6xl lg:text-[72px] font-bold leading-[1] tracking-tight">
              <span className="text-[#F4F6F8]">Narimon</span>
              <br />
              <span className="text-[#00E58E] drop-shadow-[0_0_28px_rgba(0,229,142,0.55)]">Ecosystem</span>
            </h1>
            <p className="mt-6 text-base lg:text-lg text-[#97A2AE] max-w-xl leading-relaxed">
              Sun'iy intellekt, xavfsiz brauzer va aqlli raqamli himoya — bir platformada birlashtirilgan ekotizim.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/ai"
                className="group flex items-center gap-2 px-5 py-3 rounded-xl bg-[#0B1015] border border-[rgba(0,255,170,0.2)] hover:border-[rgba(0,255,170,0.5)] transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-[#00E58E]/10 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-[#00E58E]" />
                </div>
                <span className="text-[#F4F6F8] font-medium">Narimon AI</span>
                <ChevronRight className="w-4 h-4 text-[#97A2AE] group-hover:text-[#00E58E] group-hover:translate-x-0.5 transition-all" />
              </Link>
              <Link
                to="/browser"
                className="group flex items-center gap-2 px-5 py-3 rounded-xl bg-[#0B1015] border border-[rgba(0,255,170,0.2)] hover:border-[rgba(0,255,170,0.5)] transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-[#00E58E]/10 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-[#00E58E]" />
                </div>
                <span className="text-[#F4F6F8] font-medium">Narimon Brauzer</span>
                <ChevronRight className="w-4 h-4 text-[#97A2AE] group-hover:text-[#00E58E] group-hover:translate-x-0.5 transition-all" />
              </Link>
            </div>

            {/* Stats */}
            <div className="mt-8 grid grid-cols-3 gap-3 max-w-lg">
              {[
                { icon: Users, label: "Foydalanuvchilar", value: "1M+" },
                { icon: Shield, label: "Xavfsizlik", value: "99.9%" },
                { icon: Rocket, label: "Qo'llab-quvvatlash", value: "24/7" },
              ].map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="rounded-xl border border-[rgba(0,255,170,0.12)] bg-[#0B1015]/60 backdrop-blur-sm px-3 py-3"
                >
                  <Icon className="w-4 h-4 text-[#00E58E] mb-2" />
                  <div className="text-lg font-bold text-[#F4F6F8]">{value}</div>
                  <div className="text-[11px] text-[#97A2AE]">{label}</div>
                </div>
              ))}
            </div>

            <Link
              to="/about"
              className="mt-8 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[rgba(0,255,170,0.15)] bg-[#0B1015]/60 text-sm text-[#F4F6F8] hover:border-[rgba(0,255,170,0.4)] transition-colors"
            >
              <Info className="w-4 h-4 text-[#00E58E]" />
              Batafsil
              <ChevronRight className="w-4 h-4 text-[#97A2AE]" />
            </Link>
          </motion.div>

          {/* Right hero image */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="relative w-full h-full flex items-center justify-center"
            style={{ perspective: 1200 }}
          >
            <motion.div style={{ x: tx, y: ty, rotateX: rotX, rotateY: rotY }} className="relative w-full">
              <div className="absolute inset-8 blur-3xl bg-[#00E58E]/25 rounded-full" />
              <motion.img
                src={heroImage}
                alt="Narimon Ecosystem holographic logo"
                width={1280}
                height={1024}
                className="relative w-full max-h-[78vh] select-none"
                style={{ objectFit: "contain" }}
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
