import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Crown } from "lucide-react";
import Navbar from "@/components/Navbar";
import Particles from "@/components/Particles";
import Footer from "@/components/Footer";

const tiers = [
  { name: "Free", price: "0", desc: "Boshlash uchun", features: ["100 ta tahlil / oy", "Asosiy moderatsiya", "Community qo'llab-quvvatlash"], cta: "Boshlash" },
  { name: "Pro", price: "29", desc: "Professionallar uchun", featured: true, features: ["10 000 ta tahlil / oy", "Kengaytirilgan AI", "API kirish", "Email qo'llab-quvvatlash"], cta: "Pro olish" },
  { name: "Enterprise", price: "Aloqada", desc: "Tashkilotlar uchun", features: ["Cheksiz tahlil", "Maxsus modellar", "SLA", "Maxsus integratsiya"], cta: "Bog'lanish" },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-[#050607] text-[#F4F6F8]">
      <Navbar />
      <section className="relative pt-32 pb-16 container mx-auto px-4">
        <Particles count={20} />
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            <span className="text-[#F4F6F8]">Tarif </span>
            <span className="text-[#00E58E] drop-shadow-[0_0_24px_rgba(0,229,142,0.5)]">rejalari</span>
          </h1>
          <p className="text-[#97A2AE] mt-4">Loyihangiz uchun mos rejani tanlang.</p>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {tiers.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className={`relative rounded-2xl p-6 border ${
                t.featured
                  ? "border-[rgba(0,229,142,0.45)] bg-gradient-to-b from-[#00E58E]/10 to-[#0B1015] shadow-[0_0_50px_rgba(0,229,142,0.18)]"
                  : "border-[rgba(0,255,170,0.12)] bg-[#0B1015]"
              }`}
            >
              {t.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#00E58E] text-[#04140B] text-xs font-semibold flex items-center gap-1">
                  <Crown className="w-3 h-3" /> Tavsiya etiladi
                </div>
              )}
              <div className="text-sm text-[#97A2AE]">{t.desc}</div>
              <div className="mt-2 text-2xl font-bold">{t.name}</div>
              <div className="mt-3 text-4xl font-bold">
                {t.price === "Aloqada" ? t.price : <>${t.price}<span className="text-base font-normal text-[#97A2AE]">/oy</span></>}
              </div>
              <ul className="mt-5 space-y-2.5 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[#F4F6F8]">
                    <Check className="w-4 h-4 text-[#00E58E]" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/login"
                className={`mt-6 block text-center py-3 rounded-xl font-semibold ${
                  t.featured
                    ? "bg-gradient-to-r from-[#00E58E] to-[#1CF7D2] text-[#04140B]"
                    : "border border-[rgba(0,255,170,0.25)] text-[#F4F6F8] hover:border-[rgba(0,255,170,0.5)]"
                }`}
              >
                {t.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
      <Footer />
    </div>
  );
}
