import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CrmStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

interface StatusBadgeProps {
  children: ReactNode;
  tone?: CrmStatusTone;
}

const toneClasses: Record<CrmStatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-blue-500/15 text-blue-400",
  success: "bg-emerald-500/15 text-emerald-400",
  warning: "bg-amber-500/15 text-amber-400",
  danger: "bg-red-500/15 text-red-400",
};

const dotClasses: Record<CrmStatusTone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-blue-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-red-400",
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide",
      toneClasses[tone]
    )}>
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", dotClasses[tone])} />
      {children}
    </span>
  );
}
