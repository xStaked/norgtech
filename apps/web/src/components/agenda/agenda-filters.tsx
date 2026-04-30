import Link from "next/link";
import { crmTheme } from "@/components/ui/theme";

export type AgendaView = "hoy" | "semana" | "vencidos";

interface AgendaFiltersProps {
  active: AgendaView;
  counts: Record<AgendaView, number>;
}

const viewLabels: Record<AgendaView, string> = {
  hoy: "Hoy",
  semana: "Esta semana",
  vencidos: "Vencidos / Urgente",
};

export function AgendaFilters({ active, counts }: AgendaFiltersProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        padding: "6px",
        borderRadius: crmTheme.radius.lg,
        background: crmTheme.colors.surface,
        border: `1px solid ${crmTheme.colors.border}`,
      }}
    >
      {(["hoy", "semana", "vencidos"] as AgendaView[]).map((view) => {
        const isActive = active === view;
        return (
          <Link
            key={view}
            href={`/agenda?view=${view}`}
            style={{
              padding: "8px 14px",
              borderRadius: crmTheme.radius.md,
              border: "none",
              background: isActive ? crmTheme.colors.primary : "transparent",
              color: isActive ? "#fff" : crmTheme.colors.textMuted,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              transition: "background 160ms ease, color 160ms ease",
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
            }}
          >
            {viewLabels[view]}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 20,
                height: 20,
                padding: "0 6px",
                borderRadius: 999,
                background: isActive ? "rgba(255,255,255,0.2)" : crmTheme.colors.surfaceMuted,
                color: isActive ? "#fff" : crmTheme.colors.textSubtle,
                fontSize: 11,
              }}
            >
              {counts[view]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
