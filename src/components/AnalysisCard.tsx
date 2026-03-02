import { ReactNode } from "react";

interface AnalysisCardProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function AnalysisCard({ title, icon, children, className = "" }: AnalysisCardProps) {
  return (
    <div className={`relative rounded-xl bg-card border border-border p-6 gradient-border ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}
