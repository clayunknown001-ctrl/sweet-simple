import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const NavHistoryControls = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Show only on inner pages; hide on home and auth
  if (location.pathname === "/" || location.pathname === "/auth") return null;

  const btn =
    "h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border/60 bg-background/70 backdrop-blur text-foreground/80 hover:text-foreground hover:bg-accent/40 hover:border-primary/40 transition-colors shadow-sm";

  return (
    <div className="fixed top-3 left-3 z-[60] flex items-center gap-2">
      <button
        type="button"
        aria-label="Go back"
        title="Back"
        onClick={() => navigate(-1)}
        className={btn}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Go forward"
        title="Forward"
        onClick={() => navigate(1)}
        className={btn}
      >
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
};

export default NavHistoryControls;
