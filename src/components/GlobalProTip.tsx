import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useUpgradeModal } from "@/components/admin/ProUpgradeModal";

/**
 * Mock usage signal. In production this should come from the backend
 * (storage % used, token quota remaining, etc.). For now we expose
 * a simple threshold check so the tip only triggers when the user is
 * actually close to a limit.
 */
function useUsageSignals() {
  // Mocked: 86% storage, 12% tokens remaining
  return {
    storagePct: 0.86,
    tokensRemainingPct: 0.12,
  };
}

const SESSION_KEY = "pro_tip_shown_v1";

export default function GlobalProTip() {
  const { open } = useUpgradeModal();
  const { storagePct, tokensRemainingPct } = useUsageSignals();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    const nearStorage = storagePct >= 0.8;
    const nearTokens = tokensRemainingPct <= 0.15;
    if (!nearStorage && !nearTokens) return;

    fired.current = true;
    sessionStorage.setItem(SESSION_KEY, "1");

    const message = nearStorage
      ? "Your storage is almost full."
      : "You're running low on tokens.";

    const t = setTimeout(() => {
      toast("Pro tip", {
        description: `${message} Upgrade to Pro for higher limits.`,
        duration: 8000,
        action: {
          label: "Upgrade",
          onClick: () => open(),
        },
      });
    }, 1200);

    return () => clearTimeout(t);
  }, [storagePct, tokensRemainingPct, open]);

  return null;
}
