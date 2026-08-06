"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export function NoraTypingIndicator() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Magali está procesando tu mensaje"
      className="flex max-w-[88%] items-center gap-3"
    >
      <div
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]"
        style={{ background: "linear-gradient(135deg,#6d4ff0,#9b5cf0)" }}
      >
        <Sparkles className="h-[15px] w-[15px] text-white" strokeWidth={2.2} />
      </div>
      <div className="inline-flex items-center gap-2.5 rounded-[11px] border border-[#ece8f8] bg-card px-3.5 py-2.5 text-[13px] font-semibold text-[#9a8fd0] shadow-[0_2px_8px_rgba(109,79,240,.06)]">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-[#9b5cf0]"
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
        <span className="text-xs">Magali está pensando...</span>
      </div>
    </div>
  );
}
