"use client";

import { MapPin, Phone, Package, FileText, ShoppingCart, Tag, User, Users, Calendar } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";

interface DataCardProps {
  entityType: string;
  action: "list" | "detail";
  data: unknown;
  summary: string;
}

function normalizeEntityType(entityType: string): string {
  const normalized = entityType.toLowerCase();

  const aliases: Record<string, string> = {
    customers: "customer",
    contacts: "contact",
    products: "product",
    quotes: "quote",
    orders: "order",
    segments: "segment",
    visits: "visit",
    followups: "followup",
    opportunities: "opportunity",
  };

  return aliases[normalized] ?? normalized;
}

function getItemPrimaryText(item: Record<string, unknown>, index: number): string {
  return String(
    item.label
      ?? item.displayName
      ?? item.name
      ?? item.title
      ?? item.fullName
      ?? `#${index + 1}`,
  );
}

function getItemSecondaryText(item: Record<string, unknown>): string {
  return String(item.phone ?? item.email ?? item.sku ?? item.status ?? "");
}

function summarizeAdaptiveContext(data: unknown): string[] {
  if (Array.isArray(data)) {
    const statuses = Array.from(
      new Set(
        data
          .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).status : undefined))
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      ),
    );

    if (statuses.length === 1) {
      return [`Estado: ${statuses[0]}`];
    }

    return [];
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  const item = data as Record<string, unknown>;
  const context: string[] = [];

  if (typeof item.status === "string" && item.status.trim()) {
    context.push(`Estado: ${item.status}`);
  }

  if (typeof item.customerName === "string" && item.customerName.trim()) {
    context.push(`Cliente: ${item.customerName}`);
  } else if (typeof item.customerId === "string" && item.customerId.trim()) {
    context.push(`Cliente ${item.customerId}`);
  }

  if (typeof item.opportunityId === "string" && item.opportunityId.trim()) {
    context.push(`Oportunidad ${item.opportunityId}`);
  }

  if (typeof item.sourceQuoteId === "string" && item.sourceQuoteId.trim()) {
    context.push(`Cotización ${item.sourceQuoteId}`);
  }

  if (typeof item.scheduledAt === "string" && item.scheduledAt.trim()) {
    context.push(`Programada: ${item.scheduledAt}`);
  } else if (typeof item.dueAt === "string" && item.dueAt.trim()) {
    context.push(`Vence: ${item.dueAt}`);
  }

  return context.slice(0, 3);
}

const entityIcons: Record<string, typeof User> = {
  customer: User,
  contact: Users,
  product: Package,
  quote: FileText,
  order: ShoppingCart,
  segment: Tag,
  visit: MapPin,
  followup: Calendar,
  opportunity: Phone,
};

const entityLabels: Record<string, { singular: string; plural: string }> = {
  customer: { singular: "Cliente", plural: "Clientes" },
  contact: { singular: "Contacto", plural: "Contactos" },
  product: { singular: "Producto", plural: "Productos" },
  quote: { singular: "Cotizacion", plural: "Cotizaciones" },
  order: { singular: "Pedido", plural: "Pedidos" },
  segment: { singular: "Segmento", plural: "Segmentos" },
  visit: { singular: "Visita", plural: "Visitas" },
  followup: { singular: "Seguimiento", plural: "Seguimientos" },
  opportunity: { singular: "Oportunidad", plural: "Oportunidades" },
};

export function NoraDataCard({ entityType, action, data, summary }: DataCardProps) {
  const normalizedEntityType = normalizeEntityType(entityType);
  const Icon = entityIcons[normalizedEntityType] ?? User;
  const labels = entityLabels[normalizedEntityType] ?? { singular: entityType, plural: entityType };
  const contextLines = summarizeAdaptiveContext(data);

  if (action === "list" && Array.isArray(data)) {
    return (
      <div style={{ borderRadius: crmTheme.radius.lg, border: `1px solid ${crmTheme.nora.border}`, background: crmTheme.colors.surface, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: crmTheme.nora.soft, borderBottom: `1px solid ${crmTheme.nora.border}` }}>
          <Icon size={16} color={crmTheme.nora.primary} />
          <span style={{ fontSize: 13, fontWeight: 700, color: crmTheme.nora.textPrimary }}>{data.length} {data.length === 1 ? labels.singular : labels.plural}</span>
        </div>
        <div style={{ padding: "10px 14px", display: "grid", gap: 6, borderBottom: `1px solid ${crmTheme.nora.border}` }}>
          <p style={{ margin: 0, fontSize: 13, color: crmTheme.nora.textPrimary, lineHeight: 1.45 }}>{summary}</p>
          {contextLines.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {contextLines.map((line) => (
                <span
                  key={line}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: crmTheme.nora.primary,
                    background: crmTheme.nora.soft,
                    border: `1px solid ${crmTheme.nora.border}`,
                    borderRadius: 999,
                    padding: "4px 8px",
                  }}
                >
                  {line}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "grid", gap: 0 }}>
          {data.slice(0, 10).map((item: any, index: number) => (
            <div key={item.id ?? index} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "10px 14px", borderBottom: index < Math.min(data.length, 10) - 1 ? `1px solid ${crmTheme.nora.border}` : "none", fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: crmTheme.nora.textPrimary }}>{getItemPrimaryText(item, index)}</span>
              <span style={{ color: crmTheme.nora.textMuted }}>{getItemSecondaryText(item)}</span>
            </div>
          ))}
          {data.length > 10 && (
            <div style={{ padding: "10px 14px", fontSize: 12, color: crmTheme.nora.textMuted, textAlign: "center" }}>y {data.length - 10} mas...</div>
          )}
        </div>
      </div>
    );
  }

  const item = data as Record<string, unknown>;
  const displayFields = Object.entries(item).filter(([key]) => !["id", "createdAt", "updatedAt", "createdBy", "updatedBy"].includes(key)).slice(0, 12);

  return (
    <div style={{ borderRadius: crmTheme.radius.lg, border: `1px solid ${crmTheme.nora.border}`, background: crmTheme.colors.surface, overflow: "hidden", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: crmTheme.nora.soft, borderBottom: `1px solid ${crmTheme.nora.border}` }}>
        <Icon size={16} color={crmTheme.nora.primary} />
        <span style={{ fontSize: 13, fontWeight: 700, color: crmTheme.nora.textPrimary }}>{labels.singular}: {getItemPrimaryText(item, 0)}</span>
      </div>
      <div style={{ padding: "10px 14px", display: "grid", gap: 6, borderBottom: `1px solid ${crmTheme.nora.border}` }}>
        <p style={{ margin: 0, fontSize: 13, color: crmTheme.nora.textPrimary, lineHeight: 1.45 }}>{summary}</p>
        {contextLines.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {contextLines.map((line) => (
              <span
                key={line}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: crmTheme.nora.primary,
                  background: crmTheme.nora.soft,
                  border: `1px solid ${crmTheme.nora.border}`,
                  borderRadius: 999,
                  padding: "4px 8px",
                }}
              >
                {line}
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "grid", gap: 0 }}>
        {displayFields.map(([key, value], index) => (
          <div key={key} style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8, padding: "8px 14px", borderBottom: index < displayFields.length - 1 ? `1px solid ${crmTheme.nora.border}` : "none", fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: crmTheme.nora.textMuted }}>{key}</span>
            <span style={{ color: crmTheme.nora.textPrimary }}>{value === null || value === undefined ? "—" : String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
