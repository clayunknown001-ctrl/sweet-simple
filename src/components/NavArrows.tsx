import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function NavArrows() {
  const navigate = useNavigate();
  const loc = useLocation();

  // Hide on home page (nothing to go back to in-app)
  if (loc.pathname === "/") return null;

  const btn =
    "pointer-events-auto w-10 h-10 flex items-center justify-center rounded-full border border-[rgba(0,255,170,0.18)] bg-[#0B1015]/70 backdrop-blur-xl text-[#F4F6F8] hover:text-[#00E58E] hover:border-[rgba(0,229,142,0.45)] hover:shadow-[0_0_20px_rgba(0,229,142,0.25)] transition-all";

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-2 pointer-events-none">
      <button
        onClick={() => navigate(-1)}
        aria-label="Ortga"
        title="Ortga"
        className={btn}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => navigate(1)}
        aria-label="Oldinga"
        title="Oldinga"
        className={btn}
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
