import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CrmStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  tone?: CrmStatusTone;
  meta?: ReactNode;
}

const toneDotClasses: Record<CrmStatusTone, string> = {
  neutral: "bg-[#94a3b8]",
  info: "bg-[#0288c4]",
  success: "bg-[#167c4a]",
  warning: "bg-[#f58221]",
  danger: "bg-[#ee1c25]",
};

export function StatCard({ label, value, tone = "info", meta }: StatCardProps) {
  return (
    <div className="rounded-[10px] border border-border bg-card px-[15px] py-3">
      <div className="flex items-center gap-[7px] text-[12px] font-semibold text-muted-foreground">
        <span
          aria-hidden="true"
          className={cn("h-[7px] w-[7px] rounded-full", toneDotClasses[tone])}
        />
        {label}
      </div>
      <div className="mt-1.5 text-[22px] font-extrabold leading-none tabular-nums text-foreground">
        {value}
      </div>
      {meta ? (
        <div className="mt-1.5 text-[12px] text-muted-foreground">{meta}</div>
      ) : null}
    </div>
  );
}
