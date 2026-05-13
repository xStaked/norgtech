"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  tone?: "info" | "success" | "warning" | "danger" | "neutral";
  icon?: React.ReactNode;
  index?: number;
}

const toneClasses: Record<string, string> = {
  info: "from-blue-500/10 to-blue-600/5 border-blue-500/20",
  success: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/20",
  warning: "from-amber-500/10 to-amber-600/5 border-amber-500/20",
  danger: "from-red-500/10 to-red-600/5 border-red-500/20",
  neutral: "from-slate-500/10 to-slate-600/5 border-slate-500/20",
};

const toneDotClasses: Record<string, string> = {
  info: "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]",
  success: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]",
  warning: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
  danger: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]",
  neutral: "bg-slate-500 shadow-[0_0_8px_rgba(100,116,139,0.5)]",
};

export function KpiCard({ label, value, tone = "neutral", icon, index = 0 }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
    >
      <Card className={cn(
        "relative overflow-hidden border bg-gradient-to-br transition-all duration-300 hover:scale-[1.02] hover:shadow-lg",
        toneClasses[tone]
      )}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={cn("h-2 w-2 rounded-full", toneDotClasses[tone])} />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </span>
              </div>
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: index * 0.08 + 0.2 }}
                className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl"
              >
                {value}
              </motion.div>
            </div>
            {icon && (
              <div className="text-muted-foreground/30">
                {icon}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
