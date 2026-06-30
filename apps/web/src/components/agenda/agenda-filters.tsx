import Link from "next/link";

export type AgendaView = "hoy" | "semana" | "vencidos";

interface AgendaFiltersProps {
  active: AgendaView;
  counts: Record<AgendaView, number>;
}

const viewLabels: Record<AgendaView, string> = {
  hoy: "Hoy",
  semana: "Esta semana",
  vencidos: "Vencidos · urgente",
};

export function AgendaFilters({ active, counts }: AgendaFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-6 border-b border-border">
      {(["hoy", "semana", "vencidos"] as AgendaView[]).map((view) => {
        const isActive = active === view;
        const isDanger = view === "vencidos";
        return (
          <Link
            key={view}
            href={`/agenda?view=${view}`}
            className={[
              "-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-[13.5px] transition-colors",
              isActive
                ? "border-[#0f5c8a] font-bold text-foreground"
                : "border-transparent font-semibold text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {viewLabels[view]}
            <span
              className={[
                "inline-flex min-w-[20px] items-center justify-center rounded-full px-2 text-[11px] font-bold tabular-nums",
                isDanger
                  ? "bg-[#fcebe9] text-[#b42318]"
                  : "bg-[#e6f0f6] text-[#0f5c8a]",
              ].join(" ")}
            >
              {counts[view]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
