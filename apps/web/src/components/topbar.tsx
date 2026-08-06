"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { canAccess, SESSION_COOKIE_NAME } from "@/lib/auth";
import { NotificationBell } from "@/components/notification-bell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { apiFetchClient } from "@/lib/api.client";
import { filterNavGroups, groupTitles, type UserRole } from "@/lib/theme";
import { LogOut, Search, Sparkles, User } from "lucide-react";

interface SearchHit {
  type: "customer" | "order" | "product";
  id: string;
  title: string;
  subtitle: string | null;
}

const HIT_HREF: Record<SearchHit["type"], string> = {
  customer: "/customers",
  order: "/orders",
  product: "/products",
};

const HIT_GROUP: Record<SearchHit["type"], string> = {
  customer: "Clientes",
  order: "Pedidos",
  product: "Productos",
};

export function Topbar({ userRole }: { userRole: UserRole | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const groups = userRole ? filterNavGroups(userRole) : [];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Busqueda en datos: debounce + abort para no dejar respuestas viejas
  // pisando a las nuevas mientras se teclea.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetchClient(`/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        setHits(res.ok ? ((await res.json()) as SearchHit[]) : []);
      } catch {
        // abortado o red caida: el palette sigue sirviendo para navegar modulos
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  function handleLogout() {
    document.cookie = `${SESSION_COOKIE_NAME}=;path=/;max-age=0`;
    startTransition(() => {
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3.5 border-b border-border bg-card px-4 md:px-6">
      {/* Search */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 max-w-[340px] flex-1 items-center gap-2.5 rounded-lg border border-input bg-muted px-3 text-muted-foreground transition-colors hover:text-foreground sm:flex"
      >
        <Search className="h-4 w-4" />
        <span className="text-[13px]">Buscar en Norgtech…</span>
        <span className="ml-auto rounded border border-border px-1.5 py-px text-[11px] text-muted-foreground/70">
          ⌘K
        </span>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Buscar"
        description="Busca un módulo y presiona Enter para abrirlo"
      >
        <CommandInput
          placeholder="Buscar cliente, pedido, producto o módulo…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          {(["customer", "order", "product"] as const).map((type) => {
            const typeHits = hits.filter((hit) => hit.type === type);
            if (typeHits.length === 0) return null;
            return (
              <CommandGroup key={type} heading={HIT_GROUP[type]}>
                {typeHits.map((hit) => (
                  <CommandItem
                    key={`${hit.type}-${hit.id}`}
                    // El query va dentro del value para que el filtro de cmdk
                    // nunca esconda un resultado que ya filtró el servidor.
                    value={`${query} ${hit.title} ${hit.id}`}
                    onSelect={() => go(`${HIT_HREF[hit.type]}/${hit.id}`)}
                  >
                    <span className="font-medium">{hit.title}</span>
                    {hit.subtitle ? (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {hit.subtitle}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
          {groups.map((group) => (
            <CommandGroup key={group.label} heading={groupTitles[group.label] ?? group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`${item.label} ${item.description}`}
                  onSelect={() => go(item.href)}
                >
                  <span className="font-medium">{item.label}</span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </CommandItem>
              ))}
              {group.items.flatMap((item) =>
                (item.children ?? []).map((child) => (
                  <CommandItem
                    key={child.href}
                    value={`${item.label} ${child.label}`}
                    onSelect={() => go(child.href)}
                  >
                    <span className="font-medium">{child.label}</span>
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      {item.label}
                    </span>
                  </CommandItem>
                )),
              )}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>

      <div className="flex-1" />

      {/* Nora: solo para los roles que pueden entrar a /nora. Antes se mostraba
          a todos y facturacion/logistica caian en /dashboard?forbidden=1. */}
      {canAccess(userRole, "/nora") && (
        <Link
          href="/nora"
          className="flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13px] font-bold text-white"
          style={{ background: "var(--nora-accent)" }}
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Pregúntale a Magali</span>
        </Link>
      )}

      {/* Bell */}
      <NotificationBell />

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
