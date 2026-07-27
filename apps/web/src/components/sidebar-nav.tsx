"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePollCount } from "@/lib/use-poll-count";
import {
  filterNavGroups,
  groupTitles,
  type NavItem,
  type NavGroup,
  type NavSubItem,
  type UserRole,
} from "@/lib/theme";
import { ROLE_LABELS } from "@/lib/auth";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Alto animable sin conocer el alto del contenido: grid de una fila que va de
 * 1fr a 0fr. Es lo que evita el salto seco al colapsar/expandir.
 */
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function NavSection({
  group,
  pathname,
  pending,
  collapsed,
}: {
  group: NavGroup;
  pathname: string;
  pending: number;
  collapsed: boolean;
}) {
  return (
    <div>
      {/* El titulo se desvanece pero conserva su alto: asi los iconos no se
          mueven verticalmente mientras el ancho se anima. */}
      <div
        className={`overflow-hidden whitespace-nowrap px-2.5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.09em] text-[#5f7d96] transition-opacity duration-200 ${collapsed ? "opacity-0" : "opacity-100"}`}
      >
        {groupTitles[group.label] ?? group.label}
      </div>
      {group.items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <div key={item.href}>
            <SidebarNavItem
              item={item}
              active={active}
              badge={item.href === "/whatsapp" ? pending : 0}
              collapsed={collapsed}
            />
            {/* Las sub-pantallas solo se despliegan con el modulo abierto: el
                sidebar no es un arbol permanente. Colapsado no caben. */}
            <Collapsible open={active && !collapsed}>
              {item.children?.map((child) => (
                <SidebarSubItem
                  key={child.href}
                  child={child}
                  active={isActive(pathname, child.href)}
                />
              ))}
            </Collapsible>
          </div>
        );
      })}
    </div>
  );
}

function SidebarNavItem({
  item,
  active,
  badge = 0,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  badge?: number;
  collapsed: boolean;
}) {
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={
        active
          ? "mb-0.5 flex items-center gap-3 overflow-hidden whitespace-nowrap rounded-r-md border-l-[3px] border-[#2ea3da] bg-white/10 py-2 pl-2 pr-2.5 text-[13px] font-bold text-white"
          : "mb-0.5 flex items-center gap-3 overflow-hidden whitespace-nowrap rounded-md py-2 pl-3 pr-2.5 text-[13px] font-medium text-[#a7bdce] transition-colors hover:bg-white/[0.06] hover:text-white"
      }
    >
      <span
        className={
          active
            ? "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#2ea3da] text-[10px] font-bold text-white"
            : "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[10px] font-bold text-[#7fa9c4]"
        }
      >
        {item.shortLabel}
        {/* Colapsado no hay sitio para el contador: queda el punto de aviso. */}
        {badge > 0 ? (
          <span
            className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#25d366] transition-opacity duration-200 ${collapsed ? "opacity-100" : "opacity-0"}`}
          />
        ) : null}
      </span>
      {/* El texto se queda montado y se desvanece: el sidebar lo recorta con su
          overflow, asi el icono no se mueve ni un pixel durante la animacion. */}
      <span
        className={`transition-opacity duration-200 ${collapsed ? "opacity-0" : "opacity-100"}`}
      >
        {item.label}
      </span>
      {badge > 0 ? (
        <span
          className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[10px] font-bold text-white transition-opacity duration-200 ${collapsed ? "opacity-0" : "opacity-100"}`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarSubItem({
  child,
  active,
}: {
  child: NavSubItem;
  active: boolean;
}) {
  return (
    <Link
      href={child.href}
      className={
        active
          ? "mb-0.5 flex items-center gap-2.5 rounded-md bg-[#2ea3da]/20 py-1.5 pl-10 pr-2.5 text-[12.5px] font-bold text-white"
          : "mb-0.5 flex items-center gap-2.5 rounded-md py-1.5 pl-10 pr-2.5 text-[12.5px] font-medium text-[#8fa8bd] transition-colors hover:text-white"
      }
    >
      <span
        aria-hidden="true"
        className={`h-[5px] w-[5px] shrink-0 rounded-full ${active ? "bg-[#2ea3da]" : "bg-[#4a6c85]"}`}
      />
      {child.label}
    </Link>
  );
}

export function SidebarNav({
  userRole,
  userName,
}: {
  userRole: UserRole | null;
  userName: string | null;
}) {
  const pathname = usePathname();
  const visibleGroups = userRole ? filterNavGroups(userRole) : [];
  const displayName = userName ?? "Usuario";
  const roleLabel = userRole ? ROLE_LABELS[userRole] : "";

  const { count: pending } = usePollCount("/whatsapp/conversations/pending-count");

  // ponytail: estado en memoria, se pierde al recargar. localStorage cuando
  // alguien se queje de tener que colapsarlo en cada visita.
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden pb-3.5 transition-[width] duration-300 ease-in-out ${collapsed ? "w-[68px]" : "w-[252px]"}`}
    >
      {/* Brand. Padding constante: cualquier cambio movería los iconos de sitio
          a mitad de la animación del ancho. */}
      <div className="px-3 pt-4">
        <Collapsible open={!collapsed}>
          <div className="flex w-[228px] items-center gap-2.5 pb-3.5">
            {/* ponytail: cuadro blanco porque el icono es a color sobre claro */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/norgtech-icon-logo.png"
                alt="Norgtech"
                className="h-[26px] w-[26px] object-contain"
              />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-bold tracking-tight text-white">
                norgtech
              </div>
              <div className="text-[9.5px] font-semibold tracking-[0.04em] text-[#7fa9c4]">
                ERP COMERCIAL
              </div>
            </div>
          </div>
        </Collapsible>
        <div
          className="h-[3px] rounded-sm"
          style={{
            background:
              "linear-gradient(90deg,#00a651,#a7ce39,#0288c4,#ffcb06,#f58221,#ee1c25)",
          }}
        />
      </div>

      {/* Tirador en la costura derecha: no gasta una fila del menu y queda en el
          mismo sitio abierto o cerrado. El pr-4 del nav le reserva el hueco. */}
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
        title={collapsed ? "Expandir menú" : "Colapsar menú"}
        className="absolute right-0.5 top-1/2 z-10 flex h-14 w-3.5 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.07] text-[#7fa9c4] transition-colors hover:bg-white/20 hover:text-white"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Navigation */}
      <nav
        // Sin barra de scroll: chocaba con el tirador y ensuciaba el borde.
        className="flex-1 overflow-y-auto overflow-x-hidden pl-3 pr-4 pt-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Navegación principal"
      >
        {visibleGroups.map((group) => (
          <NavSection
            key={group.label}
            group={group}
            pathname={pathname}
            pending={pending}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* User card */}
      <div className="mx-3 mt-1.5 flex items-center gap-2.5 overflow-hidden whitespace-nowrap border-t border-white/10 px-2.5 pt-2.5">
        <div
          title={collapsed ? `${displayName} · ${roleLabel}` : undefined}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[#2ea3da] text-xs font-bold text-white"
        >
          {getInitials(displayName)}
        </div>
        <div
          className={`min-w-0 flex-1 transition-opacity duration-200 ${collapsed ? "opacity-0" : "opacity-100"}`}
        >
          <div className="truncate text-[13px] font-bold leading-tight text-white">
            {displayName}
          </div>
          <div className="truncate text-[11px] text-[#7fa9c4]">{roleLabel}</div>
        </div>
      </div>
    </div>
  );
}
