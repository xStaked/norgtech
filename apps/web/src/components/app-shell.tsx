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
      <aside className="sticky top-0 z-30 hidden h-screen w-[252px] shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarNav userRole={user?.role ?? null} userName={user?.name ?? null} />
      </aside>

      {/* Main content area */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
