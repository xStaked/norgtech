export type CrmStatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type ButtonLinkVariant = "primary" | "secondary" | "ghost" | "danger";

export type UserRole =
  | "administrador"
  | "director_comercial"
  | "comercial"
  | "tecnico"
  | "facturacion"
  | "logistica";

export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  group: "Operacion" | "Comercial" | "Catalogo";
  requiredRoles: readonly UserRole[];
}

export interface NavGroup {
  label: NavItem["group"];
  items: readonly NavItem[];
}

export const primaryNavItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    shortLabel: "DB",
    description: "Resumen operativo y actividad reciente",
    group: "Operacion",
    requiredRoles: ["administrador", "director_comercial", "comercial", "tecnico", "facturacion", "logistica"] as const,
  },
  {
    href: "/agenda",
    label: "Agenda",
    shortLabel: "AG",
    description: "Proximos compromisos y eventos",
    group: "Operacion",
    requiredRoles: ["administrador", "director_comercial", "comercial", "tecnico"] as const,
  },
  {
    href: "/visits",
    label: "Visitas",
    shortLabel: "VS",
    description: "Ejecucion y seguimiento en campo",
    group: "Operacion",
    requiredRoles: ["administrador", "director_comercial", "comercial", "tecnico"] as const,
  },
  {
    href: "/reports",
    label: "Reportes",
    shortLabel: "RP",
    description: "Reportes ejecutivos generados desde visitas",
    group: "Operacion",
    requiredRoles: ["administrador", "director_comercial", "tecnico"] as const,
  },
  {
    href: "/follow-ups",
    label: "Seguimientos",
    shortLabel: "SG",
    description: "Cola de trabajo comercial pendiente",
    group: "Operacion",
    requiredRoles: ["administrador", "director_comercial", "comercial", "tecnico"] as const,
  },
  {
    href: "/customers",
    label: "Clientes",
    shortLabel: "CL",
    description: "Base comercial y relacion activa",
    group: "Comercial",
    requiredRoles: ["administrador", "director_comercial", "comercial", "tecnico", "facturacion", "logistica"] as const,
  },
  {
    href: "/opportunities",
    label: "Oportunidades",
    shortLabel: "OP",
    description: "Pipeline y gestion por etapa",
    group: "Comercial",
    requiredRoles: ["administrador", "director_comercial", "comercial"] as const,
  },
  {
    href: "/quotes",
    label: "Cotizaciones",
    shortLabel: "CT",
    description: "Propuestas comerciales vigentes",
    group: "Comercial",
    requiredRoles: ["administrador", "director_comercial", "comercial", "facturacion"] as const,
  },
  {
    href: "/orders",
    label: "Pedidos",
    shortLabel: "PD",
    description: "Pedidos activos y su estado",
    group: "Comercial",
    requiredRoles: ["administrador", "director_comercial", "comercial", "facturacion", "logistica"] as const,
  },
  {
    href: "/billing-requests",
    label: "Facturacion",
    shortLabel: "FC",
    description: "Solicitudes de facturacion y contexto",
    group: "Comercial",
    requiredRoles: ["administrador", "director_comercial", "facturacion"] as const,
  },
  {
    href: "/products",
    label: "Productos",
    shortLabel: "PR",
    description: "Catalogo y disponibilidad comercial",
    group: "Catalogo",
    requiredRoles: ["administrador", "director_comercial", "comercial"] as const,
  },
  {
    href: "/segments",
    label: "Segmentos",
    shortLabel: "SE",
    description: "Clasificacion comercial y foco",
    group: "Catalogo",
    requiredRoles: ["administrador", "director_comercial", "comercial"] as const,
  },
] as const satisfies readonly NavItem[];

export const navGroups: readonly NavGroup[] = [
  {
    label: "Operacion",
    items: primaryNavItems.filter((item) => item.group === "Operacion"),
  },
  {
    label: "Comercial",
    items: primaryNavItems.filter((item) => item.group === "Comercial"),
  },
  {
    label: "Catalogo",
    items: primaryNavItems.filter((item) => item.group === "Catalogo"),
  },
];

const singularLabels: Record<string, string> = {
  Clientes: "Cliente",
  Oportunidades: "Oportunidad",
  Cotizaciones: "Cotizacion",
  Pedidos: "Pedido",
  Productos: "Producto",
  Segmentos: "Segmento",
  Visitas: "Visita",
  Reportes: "Reporte",
  Seguimientos: "Seguimiento",
};

function segmentToLabel(segment: string) {
  if (segment === "new") return "Nuevo";
  if (/^\d+$/.test(segment)) return `#${segment}`;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment)) {
    return `#${segment.slice(0, 8)}`;
  }
  return decodeURIComponent(segment)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function findActiveNavItem(pathname: string) {
  return primaryNavItems.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

export function getPageTitle(pathname: string) {
  const activeItem = findActiveNavItem(pathname);

  if (!activeItem) return "Norgtech CRM";

  const remainder = pathname.slice(activeItem.href.length).split("/").filter(Boolean);

  if (remainder.length === 0) return activeItem.label;
  if (remainder[0] === "new") {
    return `Nuevo ${singularLabels[activeItem.label] ?? activeItem.label}`;
  }
  if (remainder.length === 1) return `${activeItem.label} ${segmentToLabel(remainder[0])}`;

  return `${activeItem.label} ${segmentToLabel(remainder[remainder.length - 1])}`;
}

export function buildBreadcrumbs(pathname: string) {
  const activeItem = findActiveNavItem(pathname);

  if (!activeItem) {
    return [{ label: "CRM" }];
  }

  const base = [
    { label: "CRM" },
    { label: activeItem.group },
    { label: activeItem.label },
  ];

  const remainder = pathname.slice(activeItem.href.length).split("/").filter(Boolean);

  return remainder.reduce<Array<{ label: string }>>((crumbs, segment) => {
    crumbs.push({ label: segmentToLabel(segment) });
    return crumbs;
  }, base);
}

export function getStatusToneColor(tone: CrmStatusTone) {
  switch (tone) {
    case "success":
      return "#22c55e";
    case "warning":
      return "#f59e0b";
    case "danger":
      return "#ef4444";
    case "info":
      return "#3b82f6";
    default:
      return "#94a3b8";
  }
}
