import type { Metadata } from "next";
import type { ReactNode } from "react";
import { crmTheme } from "@/components/ui/theme";

export const metadata: Metadata = {
  title: "Norgtech CRM",
  description: "Base operativa compartida del CRM comercial de Norgtech.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minWidth: 320,
          fontFamily: crmTheme.typography.body,
          backgroundColor: crmTheme.colors.background,
          color: crmTheme.colors.text,
        }}
      >
        <style>{`
          :root {
            color-scheme: light;
            --crm-background: ${crmTheme.colors.background};
            --crm-surface: ${crmTheme.colors.surface};
            --crm-surface-muted: ${crmTheme.colors.surfaceMuted};
            --crm-text: ${crmTheme.colors.text};
            --crm-text-muted: ${crmTheme.colors.textMuted};
            --crm-text-subtle: ${crmTheme.colors.textSubtle};
            --crm-primary: ${crmTheme.colors.primary};
            --crm-primary-hover: ${crmTheme.colors.primaryHover};
            --crm-primary-soft: ${crmTheme.colors.primarySoft};
            --crm-border: ${crmTheme.colors.border};
            --crm-border-strong: ${crmTheme.colors.borderStrong};
            --crm-shadow-card: ${crmTheme.shadow.card};
            --crm-shadow-floating: ${crmTheme.shadow.floating};
            --crm-radius-sm: ${crmTheme.radius.sm};
            --crm-radius-md: ${crmTheme.radius.md};
            --crm-radius-lg: ${crmTheme.radius.lg};
            --crm-radius-xl: ${crmTheme.radius.xl};
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            padding: 0;
            margin: 0;
          }

          body {
            line-height: 1.5;
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
          }

          a {
            color: inherit;
            text-decoration: none;
          }

          button,
          input,
          select,
          textarea {
            font: inherit;
          }

          ::selection {
            background: ${crmTheme.colors.primarySoft};
          }
        `}</style>
        {children}
      </body>
    </html>
  );
}
