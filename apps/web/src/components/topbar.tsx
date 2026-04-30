"use client";

import { startTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  buildBreadcrumbs,
  crmTheme,
  findActiveNavItem,
  getPageTitle,
} from "@/components/ui/theme";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

function formatToday() {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();

  const breadcrumbs = buildBreadcrumbs(pathname);
  const activeItem = findActiveNavItem(pathname);
  const title = getPageTitle(pathname);

  function handleLogout() {
    document.cookie = `${SESSION_COOKIE_NAME}=;path=/;max-age=0`;
    startTransition(() => {
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <>
      <header className="crm-topbar">
        <div style={{ minWidth: 0, display: "grid", gap: 8 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              color: crmTheme.colors.textSubtle,
              fontSize: 12,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
            }}
          >
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                <span>{crumb.label}</span>
              </span>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: 28,
                  lineHeight: 1.05,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: crmTheme.colors.text,
                }}
              >
                {title}
              </h1>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  marginTop: 6,
                  color: crmTheme.colors.textMuted,
                  fontSize: 14,
                }}
              >
                <span>{activeItem?.description ?? "Operacion diaria del CRM"}</span>
                <span aria-hidden="true">•</span>
                <span style={{ textTransform: "capitalize" }}>{formatToday()}</span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gap: 2,
                  padding: "10px 14px",
                  borderRadius: crmTheme.radius.lg,
                  background: crmTheme.colors.surface,
                  border: `1px solid ${crmTheme.colors.border}`,
                  boxShadow: crmTheme.shadow.card,
                }}
              >
                <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: crmTheme.colors.textSubtle }}>
                  Sesion
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: crmTheme.colors.text }}>
                  Activa
                </span>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                style={{
                  appearance: "none",
                  border: 0,
                  borderRadius: crmTheme.radius.md,
                  background: crmTheme.colors.primary,
                  color: "#ffffff",
                  padding: "11px 16px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: crmTheme.shadow.card,
                  transition: crmTheme.motion.fast,
                }}
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      <style>{`
        .crm-topbar {
          position: sticky;
          top: 0;
          z-index: 20;
          padding: 20px ${crmTheme.spacing.page} 18px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(248, 251, 255, 0.82);
          backdrop-filter: blur(14px);
        }

        @media (max-width: 860px) {
          .crm-topbar {
            padding: 18px ${crmTheme.spacing.pageMobile} 16px;
          }
        }
      `}</style>
    </>
  );
}
