import { Sparkles, FileText, Image as ImageIcon, Video, Code2, ArrowRight, Cpu, Cloud, Shield, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: <FileText className="w-8 h-8" />,
    title: "Matn tahlili",
    desc: "Matnning kayfiyati, tili, mavzulari va kalitso'zlarini AI yordamida aniqlang.",
    link: "/text-analysis",
    color: "text-primary",
    glow: "glow-primary",
  },
  {
    icon: <ImageIcon className="w-8 h-8" />,
    title: "Rasm tahlili",
    desc: "Rasmdagi ob'ektlar, ranglar, sahna turi va matnni avtomatik aniqlang.",
    link: "/image-analysis",
    color: "text-cyan",
    glow: "glow-cyan",
  },
  {
    icon: <Video className="w-8 h-8" />,
    title: "Video tahlili",
    desc: "Videodagi sahnalar, harakatlar, ob'ektlar va nutqni AI bilan tahlil qiling.",
    link: "/video-analysis",
    color: "text-primary",
    glow: "glow-primary",
  },
  {
    icon: <Code2 className="w-8 h-8" />,
    title: "API hujjatlari",
    desc: "O'z loyihangizga integratsiya qilish uchun to'liq API dokumentatsiyasi.",
    link: "/api-docs",
    color: "text-primary",
    glow: "glow-primary",
  },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background bg-grid">
      <Navbar />

      {/* Hero */}
      <section className="container mx-auto pt-24 sm:pt-32 pb-16 sm:pb-20 px-4 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs sm:text-sm font-mono mb-6 sm:mb-8">
          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          AI-powered content analysis
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold mb-5 sm:mb-6 leading-[1.1]">
          <span className="text-foreground">Kontentni </span>
          <span className="text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.5)]">AI bilan</span>
          <br />
          <span className="text-foreground">tahlil qiling</span>
        </h1>
        <p className="text-muted-foreground text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-8 sm:mb-10 px-2">
          Matn va rasmlarni sun'iy intellekt yordamida chuqur tahlil qiling.
          Kayfiyat, til, ob'ektlar, ranglar va boshqalarni bir zumda aniqlang.
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center items-stretch sm:items-center max-w-md sm:max-w-none mx-auto">
          <Button asChild className="bg-primary text-primary-foreground hover:opacity-90 glow-primary px-6 sm:px-8 py-5 sm:py-6 text-sm sm:text-base">
            <Link to="/extension">
              🛡️ Brauzer Radarni o'rnatish
            </Link>
          </Button>
          <Button asChild variant="outline" className="border-cyan/30 text-cyan hover:bg-cyan/10 px-6 py-5 sm:py-3">
            <Link to="/image-analysis">
              <ImageIcon className="w-4 h-4 mr-2" />
              Rasm sinash
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-4 font-mono">
          ↑ Pinterest, Instagram, Facebook va boshqa saytlarda avtomatik ishlaydi
        </p>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 pb-24">
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f) => (
            <Link
              key={f.title}
              to={f.link}
              className="group border border-border rounded-2xl p-6 bg-card hover:border-primary/40 transition-all duration-300"
            >
              <div className={`${f.color} mb-4`}>{f.icon}</div>
              <h3 className="text-xl font-bold text-foreground mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm mb-4">{f.desc}</p>
              <span className={`inline-flex items-center gap-1 text-sm font-mono ${f.color} group-hover:gap-2 transition-all`}>
                Ochish <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Local-first architecture */}
      <section className="container mx-auto px-4 pb-24">
        <div className="border border-primary/20 rounded-2xl p-8 bg-gradient-to-br from-primary/5 via-transparent to-cyan/5">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">Local-first arxitektura</h2>
          </div>
          <p className="text-muted-foreground mb-8 max-w-2xl">
            AI Radar 4 qatlamli himoya bilan ishlaydi — kontentning 95%i qurilmangizda,
            tekin va bir lahzada tahlil qilinadi. Faqat shubhali holatlar cloud'ga yuboriladi.
          </p>
          <div className="grid md:grid-cols-4 gap-4">
            {[
              { icon: <Shield className="w-5 h-5" />, label: "Whitelist", desc: "Domen/app filtri", pct: "30%", color: "text-primary" },
              { icon: <Cpu className="w-5 h-5" />, label: "Lokal NSFW", desc: "Brauzerda ONNX", pct: "60%", color: "text-cyan" },
              { icon: <Sparkles className="w-5 h-5" />, label: "Skin-tone", desc: "Heuristik filtr", pct: "5%", color: "text-primary" },
              { icon: <Cloud className="w-5 h-5" />, label: "Cloud AI", desc: "Faqat shubhali", pct: "5%", color: "text-orange-500" },
            ].map((s) => (
              <div key={s.label} className="border border-border rounded-xl p-4 bg-card/50">
                <div className={`${s.color} mb-2`}>{s.icon}</div>
                <div className="text-xs font-mono text-muted-foreground uppercase">{s.label}</div>
                <div className={`text-2xl font-bold ${s.color} font-mono`}>{s.pct}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.desc}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-2 text-sm font-mono text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span>Engine: 100% Local Moderation — tashqi API yo'q, offline ishlaydi</span>
          </div>
        </div>
      </section>
    </div>
  );
}
