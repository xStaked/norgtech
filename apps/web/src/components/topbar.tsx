"use client";

import { startTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  buildBreadcrumbs,
  findActiveNavItem,
  getPageTitle,
} from "@/lib/theme";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User, ChevronRight } from "lucide-react";

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
    <header className="sticky top-0 z-20 border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="flex flex-col gap-4 px-4 py-4 md:px-6">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {breadcrumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
              <span>{crumb.label}</span>
            </span>
          ))}
        </nav>

        {/* Title row */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-[28px]">
              {title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{activeItem?.description ?? "Operacion diaria del CRM"}</span>
              <span className="text-border">•</span>
              <span className="capitalize">{formatToday()}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />

            <div className="hidden items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2 shadow-sm sm:flex">
              <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Sesion
                </div>
                <div className="text-sm font-bold text-foreground">Activa</div>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                <User className="h-5 w-5" />
                <span className="sr-only">Menu de usuario</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleLogout} className="gap-2 text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" />
                  Cerrar sesion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
