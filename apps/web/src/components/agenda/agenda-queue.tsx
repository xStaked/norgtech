import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { crmTheme } from "@/components/ui/theme";
import { computeUrgency, UrgencyBadge } from "./urgency-badge";

interface Customer {
  id: string;
  displayName: string;
}

interface QueueItem {
  id: string;
  kind: "visit" | "task";
  title: string;
  customer: Customer | null;
  scheduledAt: string;
  status: string;
  type?: string;
}

interface AgendaQueueProps {
  items: QueueItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const kindLabels: Record<string, string> = {
  visit: "Visita",
  task: "Seguimiento",
};

const typeLabels: Record<string, string> = {
  llamada: "Llamada",
  email: "Email",
  whatsapp: "WhatsApp",
  reunion: "Reunión",
  recordatorio: "Recordatorio",
  otro: "Otro",
};

export function AgendaQueue({ items, emptyTitle, emptyDescription }: AgendaQueueProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? "Sin elementos"}
        description={emptyDescription ?? "No hay actividades para mostrar en esta vista."}
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {items.map((item) => {
        const urgency = computeUrgency(item.scheduledAt, item.status, item.kind);
        const href = item.kind === "visit" ? `/visits/${item.id}` : `/follow-ups/${item.id}`;
        const meta = item.kind === "task" ? typeLabels[item.type ?? ""] ?? item.type : kindLabels[item.kind];

        return (
          <Link
            key={`${item.kind}-${item.id}`}
            href={href}
            style={{
              display: "grid",
              gap: 10,
              padding: "14px 16px",
              borderRadius: crmTheme.radius.lg,
              background: crmTheme.colors.surface,
              border: `1px solid ${crmTheme.colors.border}`,
              textDecoration: "none",
              color: "inherit",
              transition: "box-shadow 160ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = crmTheme.shadow.card;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: item.kind === "visit" ? crmTheme.colors.info : crmTheme.colors.textMuted,
                }}
              >
                {meta}
              </span>
              <UrgencyBadge level={urgency} />
            </div>

            <div style={{ display: "grid", gap: 4 }}>
              <strong style={{ fontSize: 15, lineHeight: 1.25, color: crmTheme.colors.text }}>
                {item.title}
              </strong>
              <span style={{ fontSize: 14, color: crmTheme.colors.textMuted }}>
                {item.customer?.displayName ?? "Sin cliente"}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                fontSize: 13,
                color: crmTheme.colors.textSubtle,
              }}
            >
              <span>{dateTimeFormatter.format(new Date(item.scheduledAt))}</span>
              <span style={{ textTransform: "capitalize" }}>{item.status.replace(/_/g, " ")}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
