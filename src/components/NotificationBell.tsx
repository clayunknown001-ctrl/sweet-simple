import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return [];
      return (data ?? []) as Notification[];
    },
  });

  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-xl border border-transparent hover:border-[rgba(0,255,170,0.2)] text-[#F4F6F8] transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#00E58E] text-[10px] font-bold text-[#04140B] flex items-center justify-center shadow-[0_0_10px_#00E58E]">
            {unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 rounded-2xl border border-[rgba(0,255,170,0.15)] bg-[#0B1015]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[rgba(0,255,170,0.1)]">
              <div className="text-sm font-semibold text-[#F4F6F8]">Bildirishnomalar</div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[#97A2AE]">
                  Bildirishnomalar yo'q
                </div>
              ) : (
                notifications.map((n) => (
                  <a
                    key={n.id}
                    href={n.link ?? "#"}
                    className="block px-4 py-3 border-b border-[rgba(0,255,170,0.06)] hover:bg-[#00E58E]/5"
                  >
                    <div className="text-sm font-medium text-[#F4F6F8]">{n.title}</div>
                    {n.body && <div className="text-xs text-[#97A2AE] mt-0.5">{n.body}</div>}
                  </a>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
