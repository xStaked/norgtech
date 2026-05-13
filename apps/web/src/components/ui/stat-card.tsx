import type { ReactNode } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

export type CrmStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  tone?: CrmStatusTone;
  meta?: ReactNode;
}

const toneBarClasses: Record<CrmStatusTone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

export function StatCard({ label, value, tone = "info", meta }: StatCardProps) {
  return (
    <SectionCard className="relative overflow-hidden" style={{ padding: "18px" }}>
      <div
        aria-hidden="true"
        className={cn("absolute top-0 left-0 h-1 w-16 rounded-br-full", toneBarClasses[tone])}
      />
      <div className="space-y-2.5">
        <div className="text-[13px] font-bold text-muted-foreground">{label}</div>
        <div className="text-[32px] font-extrabold leading-none text-foreground">{value}</div>
        {meta ? <div className="text-[13px] text-muted-foreground">{meta}</div> : null}
      </div>
    </SectionCard>
  );
}
