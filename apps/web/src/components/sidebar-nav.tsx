"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  crmTheme,
  navGroups,
  type NavItem,
  type NavGroup,
  type UserRole,
} from "@/components/ui/theme";

const lauraNavItem: NavItem = {
  href: "/laura",
  label: "Laura",
  shortLabel: "LA",
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
    <section style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(220, 231, 247, 0.58)",
          padding: "0 14px",
        }}
      >
        {group.label}
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        {group.items.map((item) => (
          <SidebarNavItem key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </div>
    </section>
  );
}

function SidebarNavItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      style={{
        display: "grid",
        gridTemplateColumns: "36px minmax(0, 1fr)",
        alignItems: "center",
        gap: 12,
        padding: "11px 14px",
        borderRadius: crmTheme.radius.md,
        color: active ? "#ffffff" : "rgba(220, 231, 247, 0.84)",
        background: active ? "rgba(255, 255, 255, 0.12)" : "transparent",
        border: active ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid transparent",
        boxShadow: active ? "inset 0 1px 0 rgba(255, 255, 255, 0.05)" : "none",
        transition: crmTheme.motion.fast,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "grid",
          placeItems: "center",
          width: 36,
          height: 36,
          borderRadius: 12,
          background: active ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.06)",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        {item.shortLabel}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>
          {item.label}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 12,
            color: active ? "rgba(255, 255, 255, 0.72)" : "rgba(220, 231, 247, 0.58)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.description}
        </span>
      </span>
    </Link>
  );
}

function filterNavGroups(role: UserRole) {
  const groupsWithLaura = navGroups.map((group) =>
    group.label === "Operacion"
      ? {
          ...group,
          items: [...group.items, lauraNavItem],
        }
      : group,
  );

  return groupsWithLaura
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
    <>
      <div className="crm-sidebar">
        <div className="crm-sidebar__brand">
          <div className="crm-sidebar__brand-mark">NT</div>
          <div className="crm-sidebar__brand-copy">
            <div className="crm-sidebar__brand-title">Norgtech CRM</div>
            <div className="crm-sidebar__brand-subtitle">Operacion comercial</div>
          </div>
        </div>

        <nav className="crm-sidebar__nav" aria-label="Navegacion principal">
          {visibleGroups.map((group) => (
            <NavSection key={group.label} group={group} pathname={pathname} />
          ))}
        </nav>

        <div className="crm-sidebar__footer">
          <div style={{ fontSize: 12, fontWeight: 600 }}>Base compartida</div>
          <div style={{ fontSize: 12, color: "rgba(220, 231, 247, 0.6)" }}>
            Shell, tokens y primitives listos para el resto del CRM.
          </div>
        </div>
      </div>

      <style>{`
        .crm-sidebar {
          position: sticky;
          top: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          gap: 24px;
          height: 100vh;
          padding: 20px 16px 18px;
        }

        .crm-sidebar__brand {
          display: grid;
          grid-template-columns: 48px minmax(0, 1fr);
          align-items: center;
          gap: 14px;
          padding: 10px 12px;
          border-radius: ${crmTheme.radius.lg};
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .crm-sidebar__brand-mark {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: 16px;
          background: linear-gradient(135deg, #f0b543 0%, #f7d06b 100%);
          color: ${crmTheme.colors.primary};
          font-size: 16px;
          font-weight: 800;
        }

        .crm-sidebar__brand-title {
          color: #ffffff;
          font-size: 15px;
          font-weight: 700;
        }

        .crm-sidebar__brand-subtitle {
          color: rgba(220, 231, 247, 0.68);
          font-size: 12px;
        }

        .crm-sidebar__nav {
          min-height: 0;
          display: grid;
          gap: 18px;
          align-content: start;
          overflow: auto;
          padding-right: 4px;
        }

        .crm-sidebar__footer {
          display: grid;
          gap: 4px;
          padding: 14px;
          border-radius: ${crmTheme.radius.lg};
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }

        @media (max-width: 1080px) {
          .crm-sidebar {
            padding-inline: 12px;
          }

          .crm-sidebar__brand {
            grid-template-columns: 1fr;
            justify-items: center;
            text-align: center;
          }

          .crm-sidebar__brand-copy,
          .crm-sidebar__footer,
          nav section > div:first-child,
          nav a span > span:last-child {
            display: none;
          }

          nav a {
            grid-template-columns: 1fr;
            justify-items: center;
            padding-inline: 8px;
          }
        }

        @media (max-width: 860px) {
          .crm-sidebar {
            position: static;
            height: auto;
            grid-template-rows: auto auto;
          }

          .crm-sidebar__nav {
            grid-auto-flow: column;
            grid-auto-columns: minmax(92px, 1fr);
            overflow-x: auto;
            overflow-y: hidden;
            padding-bottom: 2px;
          }

          .crm-sidebar__footer {
            display: none;
          }

          nav section {
            min-width: max-content;
          }

          nav section > div:first-child {
            display: none;
          }

          nav a {
            grid-template-columns: 1fr;
            justify-items: center;
            min-height: 76px;
          }
        }
      `}</style>
    </>
  );
}
