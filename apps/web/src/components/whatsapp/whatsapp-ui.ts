import type { UserRole } from "@/lib/auth";
import type { WhatsAppConversation } from "./whatsapp-types";

const AVATAR_COLORS = ["#0f5c8a", "#167c4a", "#6d4ff0", "#c2410c", "#0891b2", "#9333ea"];

export function conversationName(conversation: {
  senderName?: string | null;
  customer?: { displayName: string } | null;
  phone: string;
}) {
  return conversation.senderName || conversation.customer?.displayName || conversation.phone;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const senderTypeLabels: Record<string, string> = {
  cliente: "Cliente",
  comercial: "Comercial",
  admin: "Admin",
  desconocido: "Sin clasificar",
};

export function senderTypeLabel(senderType: WhatsAppConversation["senderType"]) {
  return senderTypeLabels[senderType] ?? senderType;
}

export const timeFormatter = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
});

export const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatOrderTotal(total: string | number | null | undefined) {
  if (total == null) return null;
  const value = typeof total === "string" ? Number(total) : total;
  if (!Number.isFinite(value)) return typeof total === "string" ? total : null;
  return currencyFormatter.format(value as number);
}

/** Roles que atienden el unicanal (espejo de UNICANAL_AGENT_ROLES del API). */
export const UNICANAL_AGENT_ROLES: readonly UserRole[] = [
  "comercial",
  "tecnico",
  "facturacion",
  "logistica",
];

export const UNICANAL_AGENT_ROLE_SET = new Set<UserRole>(UNICANAL_AGENT_ROLES);
