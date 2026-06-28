import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Eye, Brain, Lock, Activity, Users, Apple, Smartphone, Monitor, AlertTriangle, Rocket, History } from "lucide-react";
import Navbar from "@/components/Navbar";
import Particles from "@/components/Particles";
import Footer from "@/components/Footer";
import browserImg from "@/assets/narimon-browser.jpg";

const features = [
  { icon: Brain, label: "AI asosida himoya" },
  { icon: Shield, label: "Xavfsiz brauzing" },
  { icon: Eye, label: "Kontent tahlili" },
  { icon: Users, label: "Ota-ona nazorati" },
  { icon: Lock, label: "Maxfiylik" },
  { icon: Activity, label: "Realtime sayt tahlili" },
];

const downloads = [
  { platform: "windows", label: "Windows", icon: Monitor, group: "KOMPYUTER UCHUN" },
  { platform: "macos", label: "macOS", icon: Apple, group: "KOMPYUTER UCHUN" },
  { platform: "android", label: "Android", icon: Smartphone, group: "TELEFON UCHUN" },
  { platform: "ios", label: "iOS", icon: Apple, group: "TELEFON UCHUN" },
];

export default function NarimonBrowser() {
  return (
    <div className="min-h-screen bg-[#050607] text-[#F4F6F8]">
      <Navbar />
      <section className="relative pt-28 pb-12 container mx-auto px-4 overflow-hidden">
        <Particles />

        <div className="relative grid lg:grid-cols-2 gap-10 items-center">
          {/* Left image */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7 }}
            className="relative flex items-center justify-center"
          >
            <div className="absolute inset-8 blur-3xl bg-[#00E58E]/25 rounded-full" />
            <motion.img
              src={browserImg}
              alt="Narimon secure browser"
              width={1280}
              height={1024}
              loading="lazy"
              className="relative w-full max-w-[620px] select-none"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>

          {/* Right content */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7 }}
          >
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
              <span className="text-[#00E58E] drop-shadow-[0_0_24px_rgba(0,229,142,0.5)]">Narimon</span>{" "}
              <span className="text-[#F4F6F8]">Brauzer</span>
            </h1>
            <p className="mt-4 text-[#97A2AE] leading-relaxed max-w-lg">
              AI texnologiyalari bilan jihozlangan xavfsiz va aqlli brauzer. Maxfiylik, tezlik va qulaylikni birlashtirgan yangi avlod brauzeri.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {features.map((f) => (
                <div key={f.label} className="flex items-center gap-2 text-sm text-[#F4F6F8]">
                  <div className="w-7 h-7 rounded-lg bg-[#00E58E]/10 flex items-center justify-center">
                    <f.icon className="w-3.5 h-3.5 text-[#00E58E]" />
                  </div>
                  {f.label}
                </div>
              ))}
            </div>

            {/* Downloads */}
            <div className="mt-8 space-y-5">
              {["KOMPYUTER UCHUN", "TELEFON UCHUN"].map((group) => (
                <div key={group}>
                  <div className="text-xs tracking-[0.18em] text-[#97A2AE] mb-2">{group}</div>
                  <div className="grid grid-cols-2 gap-3">
                    {downloads.filter((d) => d.group === group).map((d) => (
                      <Link
                        key={d.platform}
                        to={`/download/${d.platform}`}
                        className="group flex items-center gap-2 px-4 py-3 rounded-xl border border-[rgba(0,255,170,0.18)] bg-[#0B1015] hover:border-[rgba(0,255,170,0.45)] transition-colors"
                      >
                        <d.icon className="w-4 h-4 text-[#00E58E]" />
                        <span className="font-medium text-[#F4F6F8]">{d.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Limitations / Future */}
        <div className="mt-16 grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[rgba(0,255,170,0.12)] bg-[#0B1015] p-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-[#FFB020]" />
              <h3 className="font-semibold">Kamchiliklar</h3>
            </div>
            <ul className="text-sm text-[#97A2AE] space-y-1.5 list-disc list-inside">
              <li>Ba'zi saytlar bilan moslik muammolari.</li>
              <li>Ayrim funksiyalar hali beta bosqichida.</li>
              <li>Kengaytmalar soni hozircha cheklangan.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-[rgba(0,255,170,0.12)] bg-[#0B1015] p-6">
            <div className="flex items-center gap-2 mb-3">
              <Rocket className="w-5 h-5 text-[#00E58E]" />
              <h3 className="font-semibold">Kelajakdagi yangiliklar</h3>
            </div>
            <ul className="text-sm text-[#97A2AE] space-y-1.5 list-disc list-inside">
              <li>AI yordamchisi to'liq integratsiyasi.</li>
              <li>Bulutli sinxronizatsiya va qurilmalararo moslik.</li>
              <li>Ko'proq plaginlar va kengaytmalar.</li>
            </ul>
          </div>
        </div>

        {/* Changelog */}
        <div className="mt-6 rounded-2xl border border-[rgba(0,255,170,0.12)] bg-[#0B1015] p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-[#00E58E]" />
            <h3 className="font-semibold">Versiyalar tarixi</h3>
          </div>
          <div className="divide-y divide-[rgba(0,255,170,0.08)]">
            {[
              { v: "v0.3.0", t: "Realtime moderatsiya optimizatsiyasi" },
              { v: "v0.2.0", t: "Yangi AI filtr modullari qo'shildi" },
              { v: "v0.1.0", t: "Birinchi public MVP relizi" },
            ].map((r) => (
              <div key={r.v} className="flex justify-between py-2.5 text-sm">
                <span className="text-[#00E58E] font-mono">{r.v}</span>
                <span className="text-[#97A2AE]">{r.t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
