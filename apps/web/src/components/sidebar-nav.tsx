"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  navGroups,
  primaryNavItems,
  type NavItem,
  type NavGroup,
  type UserRole,
} from "@/lib/theme";
import { Separator } from "@/components/ui/separator";

const noraNavItem: NavItem = {
  href: "/nora",
  label: "Nora",
  shortLabel: "NA",
  description: "Asistente conversacional para reportes y confirmaciones",
  group: "Operacion",
  requiredRoles: ["administrador", "director_comercial", "comercial", "tecnico"],
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavSection({
  group,
  pathname,
}: {
  group: NavGroup;
  pathname: string;
}) {
  return (
    <div className="space-y-2.5">
      <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
        {group.label}
      </div>
      <div className="space-y-0.5">
        {group.items.map((item) => (
          <SidebarNavItem
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
          />
        ))}
      </div>
    </div>
  );
}

function SidebarNavItem({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold tracking-wide ${
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "bg-sidebar-accent/50 text-sidebar-foreground/70 group-hover:bg-sidebar-accent group-hover:text-sidebar-accent-foreground"
        }`}
      >
        {item.shortLabel}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold">{item.label}</span>
        <span className="truncate text-[11px] text-sidebar-foreground/50">
          {item.description}
        </span>
      </div>
    </Link>
  );
}

function filterNavGroups(role: UserRole) {
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

export function SidebarNav({ userRole }: { userRole: UserRole | null }) {
  const pathname = usePathname();
  const visibleGroups = userRole ? filterNavGroups(userRole) : [];

  return (
    <div className="flex h-full flex-col gap-5 p-4">
      {/* Brand */}
      <div className="flex items-center gap-3 rounded-xl border border-sidebar-border/50 bg-sidebar-accent/50 p-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-yellow-300 text-lg font-extrabold text-brand-800">
          NT
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-sidebar-foreground">
            Norgtech CRM
          </div>
          <div className="text-xs text-sidebar-foreground/60">
            Operacion comercial
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-auto pr-1" aria-label="Navegacion principal">
        {visibleGroups.map((group, index) => (
          <div key={group.label}>
            {index > 0 && (
              <Separator className="mb-6 bg-sidebar-border/50" />
            )}
            <NavSection group={group} pathname={pathname} />
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="space-y-1 rounded-xl border border-sidebar-border/50 bg-sidebar-accent/30 p-3">
        <div className="text-xs font-semibold text-sidebar-foreground">
          Base compartida
        </div>
        <div className="text-xs text-sidebar-foreground/50">
          Shell, tokens y primitives listos para el resto del CRM.
        </div>
      </div>
    </div>
  );
}
