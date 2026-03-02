import { Link, useLocation } from "react-router-dom";
import { Brain, FileText, Image, BookOpen, Zap } from "lucide-react";

const navItems = [
  { path: "/", label: "Bosh sahifa", icon: Zap },
  { path: "/text-analysis", label: "Matn tahlili", icon: FileText },
  { path: "/image-analysis", label: "Rasm tahlili", icon: Image },
  { path: "/api-docs", label: "API", icon: BookOpen },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="relative">
            <Brain className="w-8 h-8 text-primary animate-pulse-glow" />
            <div className="absolute inset-0 blur-lg bg-primary/30 rounded-full" />
          </div>
          <span className="text-xl font-bold tracking-tight">
            <span className="text-primary text-glow">AI</span>
            <span className="text-foreground"> Content Insights</span>
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {navItems.map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-primary/10 text-primary glow-green"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
