import { motion } from "framer-motion";
import { Brain, Globe, Shield, Cpu, GraduationCap, Code2, Target, Eye, Sparkles, Rocket } from "lucide-react";
import Navbar from "@/components/Navbar";
import Particles from "@/components/Particles";
import Footer from "@/components/Footer";

const pillars = [
  { icon: Brain, title: "Narimon AI", desc: "Matn, rasm va video kontentni real vaqtda tahlil qiluvchi sun'iy intellekt." },
  { icon: Globe, title: "Xavfsiz Brauzer", desc: "AI yordamida zararli saytlardan himoya qiluvchi yangi avlod brauzeri." },
  { icon: Shield, title: "Ota-ona nazorati", desc: "Bolalaringizni onlayn tahdidlardan aqlli filtrlar bilan himoya qiling." },
  { icon: Cpu, title: "Operatsion tizim", desc: "Android/Linux asosida xavfsiz raqamli muhit (kelajakdagi reja)." },
  { icon: GraduationCap, title: "Ta'lim", desc: "Foydali kontentni saqlab, zararli oqimlardan ajratuvchi platforma." },
  { icon: Code2, title: "API", desc: "Dasturchilar uchun moderatsiya va kontent tahlil API'lari." },
];

const roadmap = [
  { phase: "Faza 1", title: "MVP brauzer", desc: "Barqaror AI moderatsiya va filtrlash tizimi." },
  { phase: "Faza 2", title: "Real vaqt tahlili", desc: "Tezroq va aniqroq xulq-atvor tahlili." },
  { phase: "Faza 3", title: "To'liq ekotizim", desc: "Brauzer, kengaytma, monitoring, moderatsiya API'lari." },
  { phase: "Faza 4", title: "Xavfsiz OS", desc: "Android/Linux asosidagi xavfsiz operatsion qatlam." },
];

export default function About() {
  return (
    <div className="min-h-screen bg-[#050607] text-[#F4F6F8]">
      <Navbar />
      <div className="relative pt-32 pb-20 container mx-auto px-4">
        <Particles count={20} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto"
        >
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            Biz <span className="text-[#00E58E] drop-shadow-[0_0_24px_rgba(0,229,142,0.5)]">haqimizda</span>
          </h1>
          <p className="mt-5 text-[#97A2AE] leading-relaxed">
            Narimon Ecosystem — sun'iy intellekt, xavfsiz brauzer va aqlli filtrlash tizimlari orqali sog'lom raqamli muhit yaratuvchi platforma.
          </p>
        </motion.div>

        {/* Mission / Vision / Goals */}
        <div className="mt-14 grid md:grid-cols-3 gap-4">
          {[
            { icon: Target, title: "Missiya", desc: "Foydalanuvchilarni zararli onlayn kontentdan himoya qilib, foydali raqamli muhitni saqlab qolish." },
            { icon: Eye, title: "Vizyon", desc: "AI yordamida ishlaydigan xavfsiz internet ekotizimini barpo etish." },
            { icon: Sparkles, title: "Maqsadlar", desc: "Tezkor, aniq va kontekstga sezgir moderatsiya tizimlarini yaratish." },
          ].map((m, i) => (
            <motion.div
              key={m.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="rounded-2xl border border-[rgba(0,255,170,0.12)] bg-[#0B1015] p-6"
            >
              <div className="w-11 h-11 rounded-xl bg-[#00E58E]/10 flex items-center justify-center mb-4">
                <m.icon className="w-5 h-5 text-[#00E58E]" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{m.title}</h3>
              <p className="text-[#97A2AE] text-sm leading-relaxed">{m.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Pillars */}
        <div className="mt-16">
          <h2 className="text-3xl font-bold mb-6">Ekotizim ustunlari</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pillars.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                whileHover={{ y: -3 }}
                className="rounded-2xl border border-[rgba(0,255,170,0.12)] bg-[#0B1015] p-5 hover:border-[rgba(0,255,170,0.3)] transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-[#00E58E]/10 flex items-center justify-center mb-3">
                  <p.icon className="w-5 h-5 text-[#00E58E]" />
                </div>
                <h3 className="font-semibold mb-1.5">{p.title}</h3>
                <p className="text-[#97A2AE] text-sm leading-relaxed">{p.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Roadmap timeline */}
        <div className="mt-16">
          <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
            <Rocket className="w-7 h-7 text-[#00E58E]" />
            Kelajakdagi yo'l xaritasi
          </h2>
          <div className="relative pl-8">
            <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-[#00E58E] via-[#00E58E]/40 to-transparent" />
            <div className="space-y-5">
              {roadmap.map((r, i) => (
                <motion.div
                  key={r.phase}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="relative rounded-2xl border border-[rgba(0,255,170,0.12)] bg-[#0B1015] p-5"
                >
                  <div className="absolute -left-[22px] top-6 w-3 h-3 rounded-full bg-[#00E58E] shadow-[0_0_12px_#00E58E]" />
                  <div className="text-xs text-[#00E58E] font-semibold tracking-wider uppercase">{r.phase}</div>
                  <div className="text-lg font-semibold mt-1">{r.title}</div>
                  <p className="text-[#97A2AE] text-sm mt-1.5 leading-relaxed">{r.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
