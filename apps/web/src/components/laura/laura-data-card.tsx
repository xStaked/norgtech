"use client";

import { MapPin, Phone, Package, FileText, ShoppingCart, Tag, User, Users, Calendar } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";

interface DataCardProps {
  entityType: string;
  action: "list" | "detail";
  data: unknown;
  summary: string;
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

export function LauraDataCard({ entityType, action, data, summary }: DataCardProps) {
  const Icon = entityIcons[entityType] ?? User;
  const labels = entityLabels[entityType] ?? { singular: entityType, plural: entityType };

  if (action === "list" && Array.isArray(data)) {
    return (
      <div style={{ borderRadius: crmTheme.radius.lg, border: `1px solid ${crmTheme.laura.border}`, background: crmTheme.colors.surface, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: crmTheme.laura.soft, borderBottom: `1px solid ${crmTheme.laura.border}` }}>
          <Icon size={16} color={crmTheme.laura.primary} />
          <span style={{ fontSize: 13, fontWeight: 700, color: crmTheme.laura.textPrimary }}>{data.length} {data.length === 1 ? labels.singular : labels.plural}</span>
        </div>
        <div style={{ display: "grid", gap: 0 }}>
          {data.slice(0, 10).map((item: any, index: number) => (
            <div key={item.id ?? index} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "10px 14px", borderBottom: index < Math.min(data.length, 10) - 1 ? `1px solid ${crmTheme.laura.border}` : "none", fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: crmTheme.laura.textPrimary }}>{item.displayName ?? item.name ?? item.title ?? item.fullName ?? `#${index + 1}`}</span>
              <span style={{ color: crmTheme.laura.textMuted }}>{item.phone ?? item.email ?? item.sku ?? item.status ?? ""}</span>
            </div>
          ))}
          {data.length > 10 && (
            <div style={{ padding: "10px 14px", fontSize: 12, color: crmTheme.laura.textMuted, textAlign: "center" }}>y {data.length - 10} mas...</div>
          )}
        </div>
      </div>
    );
  }

  const item = data as Record<string, unknown>;
  const displayFields = Object.entries(item).filter(([key]) => !["id", "createdAt", "updatedAt", "createdBy", "updatedBy"].includes(key)).slice(0, 12);

  return (
    <div style={{ borderRadius: crmTheme.radius.lg, border: `1px solid ${crmTheme.laura.border}`, background: crmTheme.colors.surface, overflow: "hidden", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: crmTheme.laura.soft, borderBottom: `1px solid ${crmTheme.laura.border}` }}>
        <Icon size={16} color={crmTheme.laura.primary} />
        <span style={{ fontSize: 13, fontWeight: 700, color: crmTheme.laura.textPrimary }}>{labels.singular}: {(item as any).displayName ?? (item as any).name ?? (item as any).title}</span>
      </div>
      <div style={{ display: "grid", gap: 0 }}>
        {displayFields.map(([key, value], index) => (
          <div key={key} style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8, padding: "8px 14px", borderBottom: index < displayFields.length - 1 ? `1px solid ${crmTheme.laura.border}` : "none", fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: crmTheme.laura.textMuted }}>{key}</span>
            <span style={{ color: crmTheme.laura.textPrimary }}>{value === null || value === undefined ? "—" : String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
