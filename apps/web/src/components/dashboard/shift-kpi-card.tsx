"use client";

import { ShiftCard } from "@/components/ui/shift-card";
import { cn } from "@/lib/utils";

interface ShiftKpiCardProps {
  label: string;
  value: string;
  tone?: "info" | "success" | "warning" | "danger" | "neutral";
  detail?: string;
  index?: number;
}

const toneDotClasses: Record<string, string> = {
  info: "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]",
  success: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]",
  warning: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
  danger: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]",
  neutral: "bg-slate-500 shadow-[0_0_8px_rgba(100,116,139,0.5)]",
};

export function ShiftKpiCard({ label, value, tone = "neutral", detail, index = 0 }: ShiftKpiCardProps) {
  return (
    <ShiftCard
      className="h-[200px] w-full md:h-[220px]"
      topContent={
        <div className="flex items-center gap-2 px-2 pt-1">
          <div className={cn("h-2 w-2 rounded-full", toneDotClasses[tone])} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
      }
      topAnimateContent={
        <div className="px-2 pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {detail ?? "Métrica actualizada en tiempo real"}
          </p>
        </div>
      }
      middleContent={
        <div className="flex flex-col items-center justify-center pb-4">
          <span className="text-4xl font-extrabold tracking-tight text-foreground md:text-5xl">
            {value}
          </span>
        </div>
      }
      bottomContent={
        <div className="space-y-2 px-4 pb-4">
          <div className="h-px w-full bg-border/50" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {detail ?? "Esta métrica se actualiza automáticamente con la actividad del equipo comercial."}
          </p>
          <div className="flex items-center gap-1.5">
            <div className={cn("h-1.5 w-1.5 rounded-full", toneDotClasses[tone])} />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {tone === "success" ? "Tendencia positiva" : tone === "danger" ? "Requiere atención" : "Estable"}
            </span>
          </div>
        </div>
      }
    />
  );
}
