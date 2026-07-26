import type { ReactNode } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { Topbar } from "@/components/topbar";
import { getCurrentUser } from "@/lib/auth.server";

interface AppShellProps {
  children: ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  const user = await getCurrentUser();

  return (
    <div className="relative flex min-h-screen bg-background">
      {/* Sidebar */}
      {/* El ancho lo pone SidebarNav (cliente): el collapse vive en su estado. */}
      <aside className="sticky top-0 z-30 hidden h-screen shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarNav userRole={user?.role ?? null} userName={user?.name ?? null} />
      </aside>

      {/* Main content area */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar userRole={user?.role ?? null} />
        <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
