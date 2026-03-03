import { Sparkles, FileText, Image as ImageIcon, Code2, ArrowRight } from "lucide-react";
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
      <section className="container mx-auto pt-32 pb-20 px-4 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm font-mono mb-8">
          <Sparkles className="w-4 h-4" />
          AI-powered content analysis
        </div>
        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
          <span className="text-foreground">Kontentni </span>
          <span className="text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.5)]">AI bilan</span>
          <br />
          <span className="text-foreground">tahlil qiling</span>
        </h1>
        <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10">
          Matn va rasmlarni sun'iy intellekt yordamida chuqur tahlil qiling.
          Kayfiyat, til, ob'ektlar, ranglar va boshqalarni bir zumda aniqlang.
        </p>
        <div className="flex gap-4 justify-center">
          <Button asChild className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 glow-primary px-6">
            <Link to="/text-analysis">
              <FileText className="w-4 h-4 mr-2" />
              Matn tahlili
            </Link>
          </Button>
          <Button asChild className="bg-cyan/20 text-cyan hover:bg-cyan/30 border border-cyan/30 glow-cyan px-6">
            <Link to="/image-analysis">
              <ImageIcon className="w-4 h-4 mr-2" />
              Rasm tahlili
            </Link>
          </Button>
        </div>
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
    </div>
  );
}
