"use client";

import { startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell,
  ChevronDown,
  LogOut,
  MapPin,
  Search,
  Sparkles,
  User,
} from "lucide-react";

export function Topbar() {
  const router = useRouter();

  function handleLogout() {
    document.cookie = `${SESSION_COOKIE_NAME}=;path=/;max-age=0`;
    startTransition(() => {
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3.5 border-b border-border bg-card px-4 md:px-6">
      {/* Company switcher */}
      <button className="flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-2.5 text-[12.5px] font-semibold text-secondary-foreground">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <span>Norgtech (NT)</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Search */}
      <div className="hidden h-9 max-w-[340px] flex-1 items-center gap-2.5 rounded-lg border border-input bg-muted px-3 text-muted-foreground sm:flex">
        <Search className="h-4 w-4" />
        <span className="text-[13px]">Buscar en Norgtech…</span>
        <span className="ml-auto rounded border border-border px-1.5 py-px text-[11px] text-muted-foreground/70">
          ⌘K
        </span>
      </div>

      <div className="flex-1" />

      {/* Nora */}
      <Link
        href="/nora"
        className="flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13px] font-bold text-white"
        style={{ background: "var(--nora-accent)" }}
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">Pregúntale a Nora</span>
      </Link>

      {/* Bell */}
      <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
        <Bell className="h-[18px] w-[18px]" />
        <span className="absolute right-2 top-1.5 h-[7px] w-[7px] rounded-full border-2 border-card bg-destructive" />
      </button>

      {/* User */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <User className="h-[18px] w-[18px]" />
          <span className="sr-only">Menú de usuario</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={handleLogout}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
