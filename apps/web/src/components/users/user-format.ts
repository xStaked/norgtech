import { type UserRole } from "@/lib/auth";

/** Paleta de avatares del diseño Enterprise, elegida de forma estable por id. */
const AVATAR_COLORS = [
  "#00a651",
  "#f58221",
  "#c27b12",
  "#2ea3da",
  "#1d6e7e",
  "#0c2c44",
  "#2596a8",
  "#5b6775",
];

export const ROLE_COLORS: Record<UserRole, string> = {
  administrador: "#0c2c44",
  director_comercial: "#0f5c8a",
  comercial: "#167c4a",
  tecnico: "#1d6e7e",
  facturacion: "#9a6410",
  logistica: "#5b6775",
};

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100000;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Verde ≥80%, azul ≥60%, naranja debajo: el semáforo de metas del diseño. */
export function goalBarColor(percentage: number) {
  if (percentage >= 80) return "#00a651";
  if (percentage >= 60) return "#0288c4";
  return "#f58221";
}

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatCop(value: number) {
  return COP.format(value);
}

/** "$680M" / "$1,2K M" — cabe en la columna estrecha de la tabla. */
export function formatCopCompact(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1).replace(".", ",")}MM`;
  if (value >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}
