"use client";

import { MapPin, Phone, Package, FileText, ShoppingCart, Tag, User, Users, Calendar } from "lucide-react";

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
    item.label ?? item.displayName ?? item.name ?? item.title ?? item.fullName ?? `#${index + 1}`,
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
    if (statuses.length === 1) return [`Estado: ${statuses[0]}`];
    return [];
  }
  if (!data || typeof data !== "object") return [];
  const item = data as Record<string, unknown>;
  const context: string[] = [];
  if (typeof item.status === "string" && item.status.trim()) context.push(`Estado: ${item.status}`);
  if (typeof item.customerName === "string" && item.customerName.trim()) context.push(`Cliente: ${item.customerName}`);
  else if (typeof item.customerId === "string" && item.customerId.trim()) context.push(`Cliente ${item.customerId}`);
  if (typeof item.opportunityId === "string" && item.opportunityId.trim()) context.push(`Oportunidad ${item.opportunityId}`);
  if (typeof item.sourceQuoteId === "string" && item.sourceQuoteId.trim()) context.push(`Cotización ${item.sourceQuoteId}`);
  if (typeof item.scheduledAt === "string" && item.scheduledAt.trim()) context.push(`Programada: ${item.scheduledAt}`);
  else if (typeof item.dueAt === "string" && item.dueAt.trim()) context.push(`Vence: ${item.dueAt}`);
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
      <div className="mb-2 overflow-hidden rounded-xl border border-border/40 bg-card/60">
        <div className="flex items-center gap-2 border-b border-border/30 bg-nora-500/5 px-3.5 py-2.5">
          <Icon className="h-4 w-4 text-nora-400" />
          <span className="text-sm font-bold text-foreground">
            {data.length} {data.length === 1 ? labels.singular : labels.plural}
          </span>
        </div>
        <div className="space-y-2 border-b border-border/30 px-3.5 py-2.5">
          <p className="text-sm text-foreground leading-relaxed">{summary}</p>
          {contextLines.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {contextLines.map((line) => (
                <span key={line} className="rounded-full border border-nora-500/20 bg-nora-500/10 px-2 py-0.5 text-[11px] font-semibold text-nora-300">
                  {line}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          {data.slice(0, 10).map((item: any, index: number) => (
            <div key={item.id ?? index} className="grid grid-cols-2 gap-2 px-3.5 py-2.5 text-sm border-b border-border/20 last:border-0">
              <span className="font-semibold text-foreground">{getItemPrimaryText(item, index)}</span>
              <span className="text-muted-foreground">{getItemSecondaryText(item)}</span>
            </div>
          ))}
          {data.length > 10 && (
            <div className="px-3.5 py-2 text-center text-xs text-muted-foreground">y {data.length - 10} mas...</div>
          )}
        </div>
      </div>
    );
  }

  const item = data as Record<string, unknown>;
  const displayFields = Object.entries(item)
    .filter(([key]) => !["id", "createdAt", "updatedAt", "createdBy", "updatedBy"].includes(key))
    .slice(0, 12);

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-border/40 bg-card/60">
      <div className="flex items-center gap-2 border-b border-border/30 bg-nora-500/5 px-3.5 py-2.5">
        <Icon className="h-4 w-4 text-nora-400" />
        <span className="text-sm font-bold text-foreground">{labels.singular}: {getItemPrimaryText(item, 0)}</span>
      </div>
      <div className="space-y-2 border-b border-border/30 px-3.5 py-2.5">
        <p className="text-sm text-foreground leading-relaxed">{summary}</p>
        {contextLines.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {contextLines.map((line) => (
              <span key={line} className="rounded-full border border-nora-500/20 bg-nora-500/10 px-2 py-0.5 text-[11px] font-semibold text-nora-300">
                {line}
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        {displayFields.map(([key, value], index) => (
          <div key={key} className="grid grid-cols-[140px_1fr] gap-2 px-3.5 py-2 text-sm border-b border-border/20 last:border-0">
            <span className="font-semibold text-muted-foreground">{key}</span>
            <span className="text-foreground">{value === null || value === undefined ? "—" : String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
