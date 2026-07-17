"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";
import {
  navGroups,
  type NavItem,
  type NavGroup,
  type UserRole,
} from "@/lib/theme";
import { ROLE_LABELS } from "@/lib/auth";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const noraNavItem: NavItem = {
  href: "/nora",
  label: "Nora",
  shortLabel: "NA",
  description: "Asistente conversacional para reportes y confirmaciones",
  group: "Operacion",
  requiredRoles: ["administrador", "director_comercial", "comercial", "tecnico"],
};

const groupTitles: Record<NavGroup["label"], string> = {
  Operacion: "Operación",
  Comercial: "Comercial",
  Catalogo: "Catálogo",
  Admin: "Administración",
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavSection({
  group,
  pathname,
  pending,
}: {
  group: NavGroup;
  pathname: string;
  pending: number;
}) {
  return (
    <div>
      <div className="px-2.5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.09em] text-[#5f7d96]">
        {groupTitles[group.label] ?? group.label}
      </div>
      {group.items.map((item) => (
        <SidebarNavItem
          key={item.href}
          item={item}
          active={isActive(pathname, item.href)}
          badge={item.href === "/whatsapp" ? pending : 0}
        />
      ))}
    </div>
  );
}

function SidebarNavItem({
  item,
  active,
  badge = 0,
}: {
  item: NavItem;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={item.href}
      className={
        active
          ? "mb-0.5 flex items-center gap-3 rounded-r-md border-l-[3px] border-[#2ea3da] bg-white/10 py-2 pl-2 pr-2.5 text-[13px] font-bold text-white"
          : "mb-0.5 flex items-center gap-3 rounded-md py-2 pl-3 pr-2.5 text-[13px] font-medium text-[#a7bdce] transition-colors hover:bg-white/[0.06] hover:text-white"
      }
    >
      <span
        className={
          active
            ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#2ea3da] text-[10px] font-bold text-white"
            : "flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[10px] font-bold text-[#7fa9c4]"
        }
      >
        {item.shortLabel}
      </span>
      <span className="truncate">{item.label}</span>
      {badge > 0 ? (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
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

  const [pending, setPending] = useState(0);
  useEffect(() => {
    let alive = true;
    async function poll() {
      const res = await apiFetchClient("/whatsapp/conversations/pending-count");
      if (alive && res.ok) {
        const data = (await res.json()) as { count: number };
        setPending(data.count);
      }
    }
    void poll();
    const id = setInterval(poll, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex h-full flex-col pb-3.5">
      {/* Brand */}
      <div className="px-[18px] pt-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/norgtech-flame.png"
              alt="Norgtech"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <div className="text-[17px] font-extrabold leading-none tracking-[-0.03em] text-white">
              norgtech
            </div>
            <div className="mt-0.5 text-[9.5px] font-semibold tracking-[0.04em] text-[#7fa9c4]">
              ERP COMERCIAL
            </div>
          </div>
        </div>
        <div
          className="mt-3.5 h-[3px] rounded-sm"
          style={{
            background:
              "linear-gradient(90deg,#00a651,#a7ce39,#0288c4,#ffcb06,#f58221,#ee1c25)",
          }}
        />
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 overflow-auto px-3 pt-3.5"
        aria-label="Navegación principal"
      >
        {visibleGroups.map((group) => (
          <NavSection
            key={group.label}
            group={group}
            pathname={pathname}
            pending={pending}
          />
        ))}
      </nav>

      {/* User card */}
      <div className="mx-3 mt-1.5 flex items-center gap-2.5 border-t border-white/10 px-2.5 pt-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[#2ea3da] text-xs font-bold text-white">
          {getInitials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold leading-tight text-white">
            {displayName}
          </div>
          <div className="truncate text-[11px] text-[#7fa9c4]">{roleLabel}</div>
        </div>
      </div>
    </div>
  );
}
