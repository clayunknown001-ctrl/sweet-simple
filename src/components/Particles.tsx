import { motion } from "framer-motion";

export default function Particles({ count = 28 }: { count?: number }) {
  const dots = Array.from({ length: count });
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((_, i) => {
        const left = (i * 37) % 100;
        const top = (i * 53) % 100;
        const delay = (i % 8) * 0.6;
        const size = 2 + (i % 3);
        return (
          <motion.span
            key={i}
            className="absolute rounded-full bg-[#1CF7D2]"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              boxShadow: "0 0 8px rgba(28,247,210,0.7)",
            }}
            animate={{ y: [0, -14, 0], opacity: [0.15, 0.85, 0.15] }}
            transition={{ duration: 4 + (i % 5), repeat: Infinity, delay, ease: "easeInOut" }}
          />
        );
      })}
    </div>
  );
}
