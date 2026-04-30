import type { ReactNode } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { Topbar } from "@/components/topbar";
import { crmTheme } from "@/components/ui/theme";
import { getCurrentUser } from "@/lib/auth.server";

interface AppShellProps {
  children: ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  const user = await getCurrentUser();

  return (
    <>
      <div className="crm-shell">
        <aside className="crm-shell__sidebar">
          <SidebarNav userRole={user?.role ?? null} />
        </aside>
        <div className="crm-shell__content">
          <Topbar />
          <main className="crm-shell__main">{children}</main>
        </div>
      </div>

      <style>{`
        .crm-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: ${crmTheme.layout.sidebarWidth} minmax(0, 1fr);
          background:
            radial-gradient(circle at top left, rgba(45, 108, 223, 0.07), transparent 26%),
            linear-gradient(180deg, #f8fbff 0%, ${crmTheme.colors.background} 28%, #edf3f9 100%);
        }

        .crm-shell__sidebar {
          min-height: 100vh;
          border-right: 1px solid ${crmTheme.colors.border};
          background:
            linear-gradient(180deg, rgba(16, 35, 63, 0.985) 0%, rgba(20, 46, 81, 0.985) 100%);
        }

        .crm-shell__content {
          min-width: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
        }

        .crm-shell__main {
          min-width: 0;
          padding: ${crmTheme.spacing.page};
        }

        @media (max-width: 1080px) {
          .crm-shell {
            grid-template-columns: 88px minmax(0, 1fr);
          }
        }

        @media (max-width: 860px) {
          .crm-shell {
            display: block;
          }

          .crm-shell__sidebar {
            min-height: auto;
            border-right: 0;
            border-bottom: 1px solid ${crmTheme.colors.border};
          }

          .crm-shell__main {
            padding: ${crmTheme.spacing.pageMobile};
          }
        }
      `}</style>
    </>
  );
}
