import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CrmStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

interface StatusBadgeProps {
  children: ReactNode;
  tone?: CrmStatusTone;
}

const toneClasses: Record<CrmStatusTone, string> = {
  neutral: "bg-[#eef1f5] text-[#6b7787]",
  info: "bg-[#e6f0f6] text-[#0f5c8a]",
  success: "bg-[#e7f6ee] text-[#167c4a]",
  warning: "bg-[#fef1e3] text-[#b8690f]",
  danger: "bg-[#fcebe9] text-[#b42318]",
};

const dotClasses: Record<CrmStatusTone, string> = {
  neutral: "bg-[#94a3b8]",
  info: "bg-[#0288c4]",
  success: "bg-[#00a651]",
  warning: "bg-[#f58221]",
  danger: "bg-[#ee1c25]",
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-[5px] px-2 py-0.5 text-[11px] font-bold",
        toneClasses[tone],
      )}
    >
      <span
        aria-hidden="true"
        className={cn("h-[5px] w-[5px] rounded-full", dotClasses[tone])}
      />
      {children}
    </span>
  );
}
