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
      {/* Ambient background gradient */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
      >
        <div className="absolute -top-[20%] -left-[10%] h-[50%] w-[50%] rounded-full bg-brand-500/5 blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] h-[40%] w-[40%] rounded-full bg-nora-500/5 blur-[100px]" />
      </div>

      {/* Sidebar */}
      <aside className="sticky top-0 z-30 hidden h-screen w-[280px] shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarNav userRole={user?.role ?? null} />
      </aside>

      {/* Mobile sidebar toggle + sheet would go here */}

      {/* Main content area */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
