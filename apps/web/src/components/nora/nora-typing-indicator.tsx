"use client";

import { motion } from "framer-motion";

export function NoraTypingIndicator() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Nora está procesando tu mensaje"
      className="inline-flex items-center gap-2.5 rounded-[20px_20px_20px_6px] border border-border/40 bg-card/80 px-3.5 py-2.5 text-sm font-semibold text-muted-foreground backdrop-blur-sm"
    >
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-nora-500"
            animate={{
              y: [0, -5, 0],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <span className="text-xs">Nora está pensando...</span>
    </div>
  );
}
