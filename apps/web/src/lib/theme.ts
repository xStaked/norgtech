export type CrmStatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type ButtonLinkVariant = "primary" | "secondary" | "ghost" | "danger";

export type UserRole =
  | "administrador"
  | "director_comercial"
  | "comercial"
  | "tecnico"
  | "facturacion"
  | "logistica";

export interface NavSubItem {
  href: string;
  label: string;
}

export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  group: "Operacion" | "Comercial" | "Catalogo" | "Analisis" | "Admin";
  requiredRoles: readonly UserRole[];
  /** Sub-pantallas: solo se despliegan cuando el item esta activo. */
  children?: readonly NavSubItem[];
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
    href: "/whatsapp",
    label: "WhatsApp",
    shortLabel: "WA",
    description: "Inbox de conversaciones y pedidos asistidos",
    group: "Operacion",
    requiredRoles: ["administrador", "director_comercial", "comercial", "tecnico", "facturacion", "logistica"] as const,
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
    href: "/expenses",
    label: "Gastos",
    shortLabel: "GS",
    description: "Gastos de campo y soportes",
    group: "Operacion",
    requiredRoles: ["administrador", "director_comercial", "comercial", "facturacion"] as const,
  },
  {
    href: "/analytics",
    label: "Analítica",
    shortLabel: "AN",
    description: "Ventas, cartera, embudo y desempeño comercial",
    group: "Analisis",
    // Direccion ve la operacion completa; un comercial ve las mismas pantallas
    // acotadas a su propia gestion (el back le fuerza el vendedor).
    requiredRoles: ["administrador", "director_comercial", "comercial"] as const,
    children: [
      { href: "/analytics/ventas", label: "Ventas" },
      { href: "/analytics/cartera", label: "Cartera" },
      { href: "/analytics/embudo", label: "Embudo" },
      { href: "/analytics/comercial", label: "Desempeño" },
    ] as const,
  },
  {
    href: "/reports",
    label: "Reportes",
    shortLabel: "RP",
    description: "Reportes ejecutivos generados desde visitas",
    group: "Analisis",
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
    href: "/orders/review",
    label: "Revisión pedidos",
    shortLabel: "RV",
    description: "Cola de pedidos en revisión por aprobar",
    group: "Comercial",
    requiredRoles: ["administrador", "facturacion"] as const,
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
    href: "/invoices",
    label: "Cartera",
    shortLabel: "CT",
    description: "Facturas, pagos y control de cartera",
    group: "Comercial",
    requiredRoles: ["administrador", "director_comercial", "facturacion", "comercial"] as const,
  },
  {
    href: "/returns",
    label: "Devoluciones",
    shortLabel: "DV",
    description: "Devoluciones y notas credito de clientes",
    group: "Comercial",
    requiredRoles: ["administrador", "director_comercial", "facturacion", "comercial"] as const,
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
    href: "/zones",
    label: "Zonas",
    shortLabel: "ZN",
    description: "Catalogo de zonas de despacho",
    group: "Catalogo",
    requiredRoles: ["administrador", "director_comercial"] as const,
  },
  {
    href: "/users",
    label: "Usuarios",
    shortLabel: "US",
    description: "Altas, roles y estado de acceso",
    group: "Admin",
    requiredRoles: ["administrador"] as const,
  },
  {
    href: "/companies",
    label: "Empresas",
    shortLabel: "EM",
    description: "Empresas facturadoras del sistema",
    group: "Admin",
    requiredRoles: ["administrador", "director_comercial"] as const,
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
  {
    label: "Analisis",
    items: primaryNavItems.filter((item) => item.group === "Analisis"),
  },
  {
    label: "Admin",
    items: primaryNavItems.filter((item) => item.group === "Admin"),
  },
];

export const groupTitles: Record<NavGroup["label"], string> = {
  Operacion: "Operación",
  Comercial: "Comercial",
  Catalogo: "Catálogo",
  Analisis: "Análisis",
  Admin: "Administración",
};

const noraNavItem: NavItem = {
  href: "/nora",
  label: "Magali",
  shortLabel: "NA",
  description: "Asistente conversacional para reportes y confirmaciones",
  group: "Operacion",
  requiredRoles: ["administrador", "director_comercial", "comercial", "tecnico"],
};

export function filterNavGroups(role: UserRole) {
  const groupsWithNora = navGroups.map((group) =>
    group.label === "Operacion"
      ? { ...group, items: [...group.items, noraNavItem] }
      : group,
  );

  return groupsWithNora
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.requiredRoles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

const singularLabels: Record<string, string> = {
  Clientes: "Cliente",
  Oportunidades: "Oportunidad",
  Cotizaciones: "Cotizacion",
  Pedidos: "Pedido",
  Productos: "Producto",
  Visitas: "Visita",
  Gastos: "Gasto",
  Reportes: "Reporte",
  Seguimientos: "Seguimiento",
  Cartera: "Cartera",
  Usuarios: "Usuario",
  Zonas: "Zona",
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
