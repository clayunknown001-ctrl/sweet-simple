import { useState, createContext, useContext, ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Check, Sparkles, Zap, Gauge } from "lucide-react";

interface Ctx {
  open: () => void;
}
const UpgradeCtx = createContext<Ctx>({ open: () => {} });
export const useUpgradeModal = () => useContext(UpgradeCtx);

export function ProUpgradeProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <UpgradeCtx.Provider value={{ open: () => setIsOpen(true) }}>
      {children}
      <UpgradeDialog open={isOpen} onOpenChange={setIsOpen} />
    </UpgradeCtx.Provider>
  );
}

export function ProUpgradeButton() {
  const { open } = useUpgradeModal();
  return (
    <button
      onClick={open}
      className="group relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground
        bg-white/5 backdrop-blur-xl border border-white/10
        transition-all duration-300
        hover:border-neon/60 hover:bg-white/10
        hover:shadow-[0_0_24px_-4px_hsl(var(--neon-glow)/0.6)]"
    >
      <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ background: "radial-gradient(120% 80% at 50% 0%, hsl(var(--neon-glow)/0.25), transparent 70%)" }} />
      <Sparkles className="w-4 h-4 text-neon relative z-10" />
      <span className="relative z-10">Pro Upgrade</span>
    </button>
  );
}

function UpgradeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 border-white/10 bg-[#0a0a0a] text-white overflow-hidden">
        <div className="relative p-8 md:p-12">
          <div className="absolute inset-0 pointer-events-none opacity-60"
               style={{ background: "radial-gradient(60% 40% at 50% 0%, hsl(var(--neon-glow)/0.18), transparent 70%)" }} />

          <div className="relative text-center mb-10">
            <p className="text-xs uppercase tracking-[0.3em] text-neon mb-3">Pricing</p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
              Choose the plan that scales with you
            </h2>
            <p className="text-sm text-white/60 mt-3 max-w-xl mx-auto">
              Start free, upgrade when you're ready. No hidden fees, cancel anytime.
            </p>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-5">
            <PlanCard
              icon={<Gauge className="w-5 h-5" />}
              name="Free"
              price="$0"
              cadence="/month"
              description="For exploring and small personal projects."
              cta="Current plan"
              features={["5,000 API tokens / month", "Community support", "1 project", "Basic analytics"]}
            />
            <PlanCard
              icon={<Sparkles className="w-5 h-5" />}
              name="Pro"
              price="$29"
              cadence="/month"
              description="For growing teams who need more power."
              cta="Upgrade to Pro"
              features={["2,000,000 API tokens / month", "Priority email support", "Unlimited projects", "Advanced analytics", "Custom domains"]}
              highlight
            />
            <PlanCard
              icon={<Zap className="w-5 h-5" />}
              name="Pay-as-you-go"
              price="$0.002"
              cadence="/ 1K tokens"
              description="Only pay for what you actually use."
              cta="Get started"
              features={["Metered billing", "No monthly commitment", "Standard support", "All Pro features"]}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanCard({
  icon, name, price, cadence, description, features, cta, highlight,
}: {
  icon: ReactNode; name: string; price: string; cadence: string;
  description: string; features: string[]; cta: string; highlight?: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl p-6 flex flex-col gap-5 transition-all duration-300 ${
        highlight
          ? "bg-gradient-to-b from-neon/10 to-transparent border border-neon/50 shadow-[0_0_40px_-12px_hsl(var(--neon-glow)/0.6)]"
          : "bg-white/[0.03] border border-white/10 hover:border-white/20"
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-widest px-3 py-1 rounded-full bg-neon text-black font-semibold">
          Most popular
        </span>
      )}
      <div className="flex items-center gap-2 text-white/80">
        <span className={highlight ? "text-neon" : "text-white/60"}>{icon}</span>
        <span className="text-sm font-medium">{name}</span>
      </div>
      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-semibold tracking-tight">{price}</span>
          <span className="text-sm text-white/50">{cadence}</span>
        </div>
        <p className="text-sm text-white/60 mt-2">{description}</p>
      </div>
      <ul className="space-y-2.5 text-sm flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className={`w-4 h-4 mt-0.5 shrink-0 ${highlight ? "text-neon" : "text-white/40"}`} />
            <span className="text-white/80">{f}</span>
          </li>
        ))}
      </ul>
      <button
        className={`w-full rounded-lg py-2.5 text-sm font-medium transition-all ${
          highlight
            ? "bg-neon text-black hover:brightness-110 shadow-[0_0_24px_-6px_hsl(var(--neon-glow)/0.8)]"
            : "bg-white/5 text-white border border-white/10 hover:bg-white/10"
        }`}
      >
        {cta}
      </button>
    </div>
  );
}
