import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Image as ImageIcon, Video, FileText, KeyRound, MessageSquare, Crown, ChevronRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Particles from "@/components/Particles";
import Footer from "@/components/Footer";
import brainImg from "@/assets/narimon-brain.jpg";

function SideCard({
  to, icon: Icon, title, subtitle,
}: { to: string; icon: any; title: string; subtitle?: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#0B1015]/80 backdrop-blur border border-[rgba(0,255,170,0.15)] hover:border-[rgba(0,255,170,0.45)] hover:shadow-[0_0_30px_rgba(0,229,142,0.15)] transition-all"
    >
      <div className="w-10 h-10 rounded-xl bg-[#00E58E]/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-[#00E58E]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[#F4F6F8]">{title}</div>
        {subtitle && <div className="text-xs text-[#97A2AE]">{subtitle}</div>}
      </div>
      <ChevronRight className="w-4 h-4 text-[#97A2AE] group-hover:text-[#00E58E] group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

export default function NarimonAI() {
  return (
    <div className="min-h-screen bg-[#050607] text-[#F4F6F8]">
      <Navbar />
      <section className="relative pt-32 pb-16 container mx-auto px-4 overflow-hidden">
        <Particles />

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center text-5xl md:text-6xl font-bold tracking-tight"
        >
          <span className="text-[#00E58E] drop-shadow-[0_0_28px_rgba(0,229,142,0.55)]">Narimon</span>{" "}
          <span className="text-[#F4F6F8]">AI</span>
        </motion.h1>
        <p className="text-center text-[#97A2AE] mt-3 max-w-xl mx-auto">
          Matn, rasm va videolarni chuqur tahlil qiluvchi sun'iy intellekt platformasi.
        </p>

        <div className="relative mt-10 grid lg:grid-cols-[1fr_minmax(360px,42%)_1fr] gap-6 items-center">
          {/* Left buttons */}
          <div className="flex flex-col gap-3 order-2 lg:order-1">
            <SideCard to="/ai/image" icon={ImageIcon} title="Rasm tahlili" subtitle="NSFW va xavfli kontent" />
            <SideCard to="/ai/video" icon={Video} title="Video tahlili" subtitle="Frame-by-frame moderatsiya" />
            <SideCard to="/ai/text" icon={FileText} title="Matn tahlili" subtitle="Toksiklik va sentiment" />
          </div>

          {/* Brain */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="relative order-1 lg:order-2 flex items-center justify-center"
          >
            <div className="absolute inset-10 blur-3xl bg-[#00E58E]/30 rounded-full" />
            <motion.img
              src={brainImg}
              alt="Holographic AI brain"
              width={1280}
              height={1280}
              loading="lazy"
              className="relative w-full max-w-[460px] select-none"
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>

          {/* Right buttons */}
          <div className="flex flex-col gap-3 order-3">
            <SideCard to="/api" icon={KeyRound} title="API kalit olish" subtitle="Dasturchilar uchun" />
            <SideCard to="/ai/chat" icon={MessageSquare} title="AI Chat" subtitle="Demo tez orada qo'shiladi" />
            <SideCard to="/pricing" icon={Crown} title="Upgrade Plan" subtitle="Tariflarni ko'rish" />
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
